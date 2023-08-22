import { ApiResponse } from '@api/helpers/api-response';
import {
    Contract,
    DataBaseHelper,
    DatabaseServer,
    KeyType,
    Logger,
    MessageAction,
    MessageError,
    MessageResponse,
    MessageServer,
    RetireRequest,
    Schema as SchemaCollection,
    Topic,
    TopicConfig,
    TopicHelper,
    Users,
    VcDocument as VcDocumentCollection,
    VcHelper,
    VCMessage,
    Wallet,
    Workers,
} from '@guardian/common';
import {
    ContractParamType,
    ContractType,
    ContractAPI,
    Schema,
    SchemaEntity,
    SchemaHelper,
    TopicType,
    WorkerTaskType,
} from '@guardian/interfaces';
import { publishSystemSchema } from './helpers/schema-publish-helper';
import { hethers } from '@hashgraph/hethers';
import { AccountId, TokenId } from '@hashgraph/sdk';

function findPair(base: string, opposite: string, pairs: any[]) {
    if (!Array.isArray(pairs)) {
        return;
    }
    return pairs.find(
        (item) =>
            (item.base === base && item.opposite === opposite) ||
            (item.base === opposite && item.opposite === base)
    );
}

async function getRetireRequests(
    workers: Workers,
    contractId: string,
    hederaAccountId: string,
    hederaAccountKey: string
) {
    const result = Buffer.from(
        await workers.addNonRetryableTask(
            {
                type: WorkerTaskType.CONTRACT_QUERY,
                data: {
                    contractId,
                    hederaAccountId,
                    hederaAccountKey,
                    functionName: 'pairs',
                    gas: 100000,
                },
            },
            20
        )
    );
    return new hethers.utils.AbiCoder()
        .decode(
            [
                'tuple(address base, address opposite, int64 baseCount, int64 oppositeCount, int64[] baseSerials, int64[] oppositeSerials, bool immediately)[]',
            ],
            result
        )[0]
        .map((item) => ({
            base: TokenId.fromSolidityAddress(item[0]).toString(),
            opposite: TokenId.fromSolidityAddress(item[1]).toString(),
            baseCount: +item[2],
            oppositeCount: +item[3],
            baseSerials: item[4],
            oppositeSerials: item[5],
        }));
}

async function addPair(
    workers: Workers,
    contractId: string,
    hederaAccountId: string,
    hederaAccountKey: string,
    base: string,
    opposite: string,
    baseCount: number,
    oppositeCount: number,
    immediately: boolean = false
) {
    const baseTokenAddress = base
        ? TokenId.fromString(base).toSolidityAddress()
        : new TokenId(0).toSolidityAddress();
    const oppositeTokenAddress = opposite
        ? TokenId.fromString(opposite).toSolidityAddress()
        : new TokenId(0).toSolidityAddress();
    return await workers.addNonRetryableTask(
        {
            type: WorkerTaskType.CONTRACT_CALL,
            data: {
                contractId,
                hederaAccountId,
                hederaAccountKey,
                functionName: 'setPair',
                gas: 1000000,
                parameters: [
                    {
                        type: ContractParamType.ADDRESS,
                        value: baseTokenAddress,
                    },
                    {
                        type: ContractParamType.ADDRESS,
                        value: oppositeTokenAddress,
                    },
                    {
                        type: ContractParamType.INT64,
                        value: Math.floor(baseCount || 0),
                    },
                    {
                        type: ContractParamType.INT64,
                        value: Math.floor(oppositeCount || 0),
                    },
                    {
                        type: ContractParamType.BOOL,
                        value: immediately,
                    },
                ],
            },
        },
        20
    );
}

async function getPairs(
    workers: Workers,
    contractId: string,
    hederaAccountId: string,
    hederaAccountKey: string
) {
    const result = Buffer.from(
        await workers.addNonRetryableTask(
            {
                type: WorkerTaskType.CONTRACT_QUERY,
                data: {
                    contractId,
                    hederaAccountId,
                    hederaAccountKey,
                    functionName: 'pairs',
                    gas: 100000,
                },
            },
            20
        )
    );
    const tokensInfo = new Map<string, any>();
    const pairs = new hethers.utils.AbiCoder()
    .decode(
        [
            'tuple(address base, address opposite, int64 baseCount, int64 oppositeCount, bool immediately)[]',
        ],
        result
    )[0]
    .map(async (item) => {
        const base = TokenId.fromSolidityAddress(item[0]).toString();
        const opposite = TokenId.fromSolidityAddress(item[1]).toString();
        let baseTokenInfo = tokensInfo.get(base);
        let oppositeTokenInfo = tokensInfo.get(opposite);
        if (!baseTokenInfo) {
            baseTokenInfo = await workers.addRetryableTask({
                type: WorkerTaskType.GET_TOKEN_INFO,
                data: { tokenId: base }
            }, 10);
            tokensInfo.set(base, baseTokenInfo);
        }
        if (!oppositeTokenInfo) {
            oppositeTokenInfo = await workers.addRetryableTask({
                type: WorkerTaskType.GET_TOKEN_INFO,
                data: { tokenId: opposite }
            }, 10);
            tokensInfo.set(opposite, oppositeTokenInfo);
        }

        return {
            base,
            opposite,
            baseSymbol: baseTokenInfo.symbol,
            oppositeSymbol: oppositeTokenInfo.symbol,
            baseDecimals: +baseTokenInfo.decimals,
            oppositeDecimals: +oppositeTokenInfo.decimals,
            baseCount: +item[2],
            oppositeCount: +item[3],
            immediately: item[4],
            available: false,
        }
    });
    return await Promise.all(pairs);
}

async function isPairAvailable(
    workers: Workers,
    contractId: string,
    hederaAccountId: string,
    hederaAccountKey: string,
    base: string,
    opposite: string
) {
    const baseTokenAddress = base
        ? TokenId.fromString(base).toSolidityAddress()
        : new TokenId(0).toSolidityAddress();
    const oppositeTokenAddress = opposite
        ? TokenId.fromString(opposite).toSolidityAddress()
        : new TokenId(0).toSolidityAddress();
    const result = Buffer.from(
        await workers.addNonRetryableTask(
            {
                type: WorkerTaskType.CONTRACT_QUERY,
                data: {
                    contractId,
                    hederaAccountId,
                    hederaAccountKey,
                    functionName: 'pairAvailable',
                    gas: 100000,
                    parameters: [
                        {
                            type: ContractParamType.ADDRESS,
                            value: baseTokenAddress,
                        },
                        {
                            type: ContractParamType.ADDRESS,
                            value: oppositeTokenAddress,
                        },
                    ],
                },
            },
            20
        )
    );
    return new hethers.utils.AbiCoder().decode(['bool'], result)[0];
}

async function getWiperRequests(
    workers: Workers,
    contractId: string,
    hederaAccountId: string,
    hederaAccountKey: string
) {
    const result = Buffer.from(
        await workers.addNonRetryableTask(
            {
                type: WorkerTaskType.CONTRACT_QUERY,
                data: {
                    contractId,
                    hederaAccountId,
                    hederaAccountKey,
                    functionName: 'requests',
                    gas: 100000,
                },
            },
            20
        )
    );
    return new hethers.utils.AbiCoder()
        .decode(['address[]'], result)[0]
        .map((item) => AccountId.fromSolidityAddress(item).toString());
}

async function getContractPermissions(
    workers: Workers,
    contractId: string,
    hederaAccountId: string,
    hederaAccountKey: string
) {
    const result = Buffer.from(
        await workers.addNonRetryableTask(
            {
                type: WorkerTaskType.CONTRACT_QUERY,
                data: {
                    contractId,
                    hederaAccountId,
                    hederaAccountKey,
                    functionName: 'permissions',
                    gas: 100000,
                },
            },
            20
        )
    );
    return Number(
        new hethers.utils.AbiCoder().decode(['uint8'], result)[0]
    ).toString(2);
}

async function getContractType(
    workers: Workers,
    contractId: string,
    hederaAccountId: string,
    hederaAccountKey: string
) {
    const result = Buffer.from(
        await workers.addNonRetryableTask(
            {
                type: WorkerTaskType.CONTRACT_QUERY,
                data: {
                    contractId,
                    hederaAccountId,
                    hederaAccountKey,
                    functionName: 'contractType',
                    gas: 100000,
                },
            },
            20
        )
    );
    return new hethers.utils.AbiCoder().decode(
        ['string'],
        result
    )[0] as ContractType;
}

/**
 * Connect to the message broker methods of working with contracts.
 */
export async function contractAPI(
    contractRepository: DataBaseHelper<Contract>,
    retireRequestRepository: DataBaseHelper<RetireRequest>
): Promise<void> {
    ApiResponse(ContractAPI.GET_CONTRACT, async (msg) => {
        try {
            if (!msg) {
                return new MessageError('Invalid get contract parameters');
            }

            const { pageIndex, pageSize, owner, type } = msg;

            const otherOptions: any = {};
            const _pageSize = parseInt(pageSize, 10);
            const _pageIndex = parseInt(pageIndex, 10);
            if (Number.isInteger(_pageSize) && Number.isInteger(_pageIndex)) {
                otherOptions.orderBy = { createDate: 'DESC' };
                otherOptions.limit = Math.min(100, _pageSize);
                otherOptions.offset = _pageIndex * _pageSize;
            } else {
                otherOptions.orderBy = { createDate: 'DESC' };
                otherOptions.limit = 100;
            }

            return new MessageResponse(
                await contractRepository.findAndCount(
                    {
                        owner,
                        type,
                    },
                    otherOptions
                )
            );
        } catch (error) {
            new Logger().error(error, ['GUARDIAN_SERVICE']);
            return new MessageError(error);
        }
    });

    // ApiResponse(ContractAPI.GET_RETIRE_REQUEST, async (msg) => {
    //     try {
    //         if (!msg) {
    //             return new MessageError('Invalid get contract parameters');
    //         }

    //         const { pageIndex, pageSize, owner, contractId, did } = msg;

    //         const filters: any = {};
    //         if (owner) {
    //             filters.owner = owner;
    //         }
    //         if (contractId) {
    //             const contracts = await contractRepository.findOne({
    //                 owner: did,
    //             });
    //             if (contracts?.owner !== did) {
    //                 throw new Error('You are not contract owner');
    //             }
    //             filters.contractId = contractId;
    //         } else {
    //             const contracts = await contractRepository.find({
    //                 owner: did,
    //             });
    //             filters.contractId = {
    //                 $in: contracts.map((contract) => contract.contractId),
    //             };
    //         }

    //         const otherOptions: any = {};
    //         const _pageSize = parseInt(pageSize, 10);
    //         const _pageIndex = parseInt(pageIndex, 10);
    //         if (Number.isInteger(_pageSize) && Number.isInteger(_pageIndex)) {
    //             otherOptions.orderBy = { createDate: 'DESC' };
    //             otherOptions.limit = Math.min(100, _pageSize);
    //             otherOptions.offset = _pageIndex * _pageSize;
    //         } else {
    //             otherOptions.orderBy = { createDate: 'DESC' };
    //             otherOptions.limit = 100;
    //         }

    //         const retireRequestsAndCount =
    //             await retireRequestRepository.findAndCount(
    //                 filters,
    //                 otherOptions
    //             );

    //         for (const retireRequest of retireRequestsAndCount[0] as any[]) {
    //             if (retireRequest.documentId) {
    //                 retireRequest.vcDocument = await new DataBaseHelper(
    //                     VcDocumentCollection
    //                 ).findOne({
    //                     _id: retireRequest.documentId,
    //                 });
    //             }
    //         }

    //         return new MessageResponse(retireRequestsAndCount);
    //     } catch (error) {
    //         new Logger().error(error, ['GUARDIAN_SERVICE']);
    //         return new MessageError(error);
    //     }
    // });

    ApiResponse(ContractAPI.CREATE_CONTRACT, async (msg) => {
        try {
            if (!msg) {
                return new MessageError('Invalid get contract parameters');
            }

            const { description, did, type } = msg;

            const users = new Users();
            const wallet = new Wallet();
            const workers = new Workers();
            const root = await users.getUserById(did);
            const rootKey = await wallet.getKey(
                root.walletToken,
                KeyType.KEY,
                did
            );

            const topicHelper = new TopicHelper(root.hederaAccountId, rootKey);
            const topic = await topicHelper.create(
                {
                    type: TopicType.ContractTopic,
                    name: TopicType.ContractTopic,
                    description: TopicType.ContractTopic,
                    owner: did,
                    policyId: null,
                    policyUUID: null,
                },
                {
                    admin: true,
                    submit: false,
                }
            );
            await topic.saveKeys();
            await DatabaseServer.saveTopic(topic.toObject());

            const contractId = await workers.addNonRetryableTask(
                {
                    type: WorkerTaskType.CREATE_CONTRACT,
                    data: {
                        bytecodeFileId:
                            type === ContractType.WIPE
                                ? process.env.WIPE_CONTRACT_FILE_ID
                                : process.env.RETIRE_CONTRACT_FILE_ID,
                        hederaAccountId: root.hederaAccountId,
                        hederaAccountKey: rootKey,
                        topicKey: rootKey,
                        memo: topic.topicId,
                    },
                },
                20
            );
            const contract = await contractRepository.save({
                contractId,
                owner: did,
                description,
                permissions: type === ContractType.WIPE ? '1111' : '11',
                type,
                topicId: topic.topicId,
            });
            return new MessageResponse(contract);
        } catch (error) {
            new Logger().error(error, ['GUARDIAN_SERVICE']);
            return new MessageError(error);
        }
    });

    ApiResponse(ContractAPI.WIPE_SYNC_REQUESTS, async (msg) => {
        try {
            if (!msg) {
                return new MessageError('Invalid get contract parameters');
            }

            const { did, contractId } = msg;

            if (!contractId) {
                throw new Error('Invalid contract identifier');
            }

            const users = new Users();
            const wallet = new Wallet();
            const workers = new Workers();
            const root = await users.getUserById(did);
            const rootKey = await wallet.getKey(
                root.walletToken,
                KeyType.KEY,
                did
            );

            const wiperRequests = await getWiperRequests(
                workers,
                contractId,
                root.hederaAccountId,
                rootKey
            );

            await contractRepository.update(
                {
                    cache: {
                        requests: wiperRequests,
                        syncDate: new Date(),
                    },
                },
                {
                    contractId,
                    owner: did,
                }
            );
            return new MessageResponse({
                requests: wiperRequests,
                syncDate: new Date(),
            });
        } catch (error) {
            new Logger().error(error, ['GUARDIAN_SERVICE']);
            return new MessageError(error);
        }
    });

    ApiResponse(ContractAPI.RETIRE_SYNC_PAIRS, async (msg) => {
        try {
            if (!msg) {
                return new MessageError('Invalid get contract parameters');
            }

            const { did, contractId } = msg;

            if (!contractId) {
                throw new Error('Invalid contract identifier');
            }

            const users = new Users();
            const wallet = new Wallet();
            const workers = new Workers();
            const root = await users.getUserById(did);
            const rootKey = await wallet.getKey(
                root.walletToken,
                KeyType.KEY,
                did
            );

            const pairs = await getPairs(
                workers,
                contractId,
                root.hederaAccountId,
                rootKey
            );
            const pairsSyncDate = new Date();

            const contract = await contractRepository.findOne({
                contractId,
                owner: did,
            });

            if (contract) {
                const cache = contract.cache || {};
                cache.pairs = pairs.map((item) => {
                    const pair = findPair(
                        item.base,
                        item.opposite,
                        cache.pairs
                    );
                    item.available = !!pair?.available;
                    return item;
                });
                cache.pairsSyncDate = pairsSyncDate;
                await contractRepository.update(
                    {
                        cache,
                    },
                    {
                        contractId,
                        owner: did,
                    }
                );
            }

            return new MessageResponse({
                pairs,
                pairsSyncDate,
            });
        } catch (error) {
            new Logger().error(error, ['GUARDIAN_SERVICE']);
            return new MessageError(error);
        }
    });

    ApiResponse(ContractAPI.RETIRE_SYNC_PAIR, async (msg) => {
        try {
            if (!msg) {
                return new MessageError('Invalid get contract parameters');
            }

            const { did, contractId, base, opposite } = msg;

            if (!contractId) {
                throw new Error('Invalid contract identifier');
            }

            const users = new Users();
            const wallet = new Wallet();
            const workers = new Workers();
            const root = await users.getUserById(did);
            const rootKey = await wallet.getKey(
                root.walletToken,
                KeyType.KEY,
                did
            );

            const available = await isPairAvailable(
                workers,
                contractId,
                root.hederaAccountId,
                rootKey,
                base,
                opposite
            );

            const contract = await contractRepository.findOne({
                contractId,
                owner: did,
            });

            if (contract) {
                const cache = contract.cache || {};
                const pair = findPair(base, opposite, cache.pairs);
                if (pair) {
                    pair.available = available;
                    await contractRepository.update(
                        {
                            cache,
                        },
                        {
                            contractId,
                            owner: did,
                        }
                    );
                }
            }

            return new MessageResponse(available);
        } catch (error) {
            new Logger().error(error, ['GUARDIAN_SERVICE']);
            return new MessageError(error);
        }
    });

    ApiResponse(ContractAPI.RETIRE_SYNC_REQUESTS, async (msg) => {
        try {
            if (!msg) {
                return new MessageError('Invalid get contract parameters');
            }

            const { did, contractId } = msg;

            if (!contractId) {
                throw new Error('Invalid contract identifier');
            }

            const users = new Users();
            const wallet = new Wallet();
            const workers = new Workers();
            const root = await users.getUserById(did);
            const rootKey = await wallet.getKey(
                root.walletToken,
                KeyType.KEY,
                did
            );

            const requests = await getRetireRequests(
                workers,
                contractId,
                root.hederaAccountId,
                rootKey
            );
            const requestsSyncDate = new Date();

            const contract = await contractRepository.findOne({
                contractId,
                owner: did,
            });

            if (contract) {
                const cache = contract.cache || {};
                cache.requests = requests;
                cache.requestsSyncDate = requestsSyncDate;
                await contractRepository.update(
                    {
                        cache,
                    },
                    {
                        contractId,
                        owner: did,
                    }
                );
            }

            return new MessageResponse({
                requests,
                requestsSyncDate,
            });
        } catch (error) {
            new Logger().error(error, ['GUARDIAN_SERVICE']);
            return new MessageError(error);
        }
    });

    ApiResponse(ContractAPI.CHECK_CONTRACT_PERMISSIONS, async (msg) => {
        try {
            if (!msg) {
                return new MessageError('Invalid get contract parameters');
            }

            const { did, contractId } = msg;

            if (!contractId) {
                throw new Error('Invalid contract identifier');
            }

            const users = new Users();
            const wallet = new Wallet();
            const workers = new Workers();
            const root = await users.getUserById(did);
            const rootKey = await wallet.getKey(
                root.walletToken,
                KeyType.KEY,
                did
            );

            const permissions = await getContractPermissions(
                workers,
                contractId,
                root.hederaAccountId,
                rootKey
            );

            await contractRepository.update(
                {
                    permissions,
                },
                {
                    contractId,
                    owner: did,
                }
            );
            return new MessageResponse(permissions);
        } catch (error) {
            new Logger().error(error, ['GUARDIAN_SERVICE']);
            return new MessageError(error);
        }
    });

    // ApiResponse(ContractAPI.ADD_CONTRACT_USER, async (msg) => {
    //     try {
    //         if (!msg) {
    //             return new MessageError('Invalid get contract parameters');
    //         }

    //         const { userId, contractId, did } = msg;

    //         if (!contractId) {
    //             throw new Error('Invalid contract identifier');
    //         }
    //         if (!userId) {
    //             throw new Error('Invalid user identifier')
    //         }

    //         const users = new Users();
    //         const wallet = new Wallet();
    //         const workers = new Workers();
    //         const root = await users.getUserById(did);
    //         const rootKey = await wallet.getKey(
    //             root.walletToken,
    //             KeyType.KEY,
    //             did
    //         );

    //         return new MessageResponse(
    //             await workers.addNonRetryableTask(
    //                 {
    //                     type: WorkerTaskType.ADD_CONTRACT_USER,
    //                     data: {
    //                         contractId,
    //                         hederaAccountId: root.hederaAccountId,
    //                         hederaAccountKey: rootKey,
    //                         userId,
    //                     },
    //                 },
    //                 20
    //             )
    //         );
    //     } catch (error) {
    //         new Logger().error(error, ['GUARDIAN_SERVICE']);
    //         return new MessageError(error);
    //     }
    // });

    ApiResponse(ContractAPI.ADD_CONTRACT_PAIR, async (msg) => {
        try {
            if (!msg) {
                return new MessageError('Invalid add contract pair parameters');
            }

            const {
                baseTokenId,
                oppositeTokenId,
                baseTokenCount,
                oppositeTokenCount,
                contractId,
                immediately,
                did,
            } = msg;

            const users = new Users();
            const wallet = new Wallet();
            const workers = new Workers();
            const root = await users.getUserById(did);
            const rootKey = await wallet.getKey(
                root.walletToken,
                KeyType.KEY,
                did
            );
            const baseToken = await new DatabaseServer().getToken(baseTokenId);
            const oppositeToken = await new DatabaseServer().getToken(
                oppositeTokenId
            );
            const baseTokenCountWithDecimals = baseToken?.decimals
                ? Math.pow(10, baseToken.decimals) * baseTokenCount
                : baseTokenCount;
            const oppositeTokenCountWithDecimals = oppositeToken?.decimals
                ? Math.pow(10, oppositeToken.decimals) * oppositeTokenCount
                : oppositeTokenCount;

            return new MessageResponse(
                await addPair(
                    workers,
                    contractId,
                    root.hederaAccountId,
                    rootKey,
                    baseTokenId,
                    oppositeTokenId,
                    baseTokenCountWithDecimals,
                    oppositeTokenCountWithDecimals
                )
            );
        } catch (error) {
            new Logger().error(error, ['GUARDIAN_SERVICE']);
            return new MessageError(error);
        }
    });

    ApiResponse(ContractAPI.IMPORT_CONTRACT, async (msg) => {
        try {
            if (!msg) {
                return new MessageError('Invalid contract identifier');
            }
            const { contractId, did, description } = msg;

            const users = new Users();
            const wallet = new Wallet();
            const workers = new Workers();
            const root = await users.getUserById(did);
            const rootKey = await wallet.getKey(
                root.walletToken,
                KeyType.KEY,
                did
            );

            const permissions = await getContractPermissions(
                workers,
                contractId,
                root.hederaAccountId,
                rootKey
            );
            const type: ContractType = await getContractType(
                workers,
                contractId,
                root.hederaAccountId,
                rootKey
            );
            const { memo } = await workers.addNonRetryableTask(
                {
                    type: WorkerTaskType.GET_CONTRACT_INFO,
                    data: {
                        contractId,
                        hederaAccountId: root.hederaAccountId,
                        hederaAccountKey: rootKey,
                    },
                },
                20
            );

            let cache = {};
            if (type === ContractType.WIPE) {
                const wiperRequests = await getWiperRequests(
                    workers,
                    contractId,
                    root.hederaAccountId,
                    rootKey
                );
                cache = {
                    requests: wiperRequests,
                    syncDate: new Date(),
                };
            }
            const contract = await contractRepository.save(
                {
                    contractId,
                    owner: did,
                    description,
                    permissions,
                    topicId: memo,
                    type,
                    cache,
                },
                {
                    contractId,
                    owner: did,
                }
            );

            return new MessageResponse(contract);
        } catch (error) {
            new Logger().error(error, ['GUARDIAN_SERVICE']);
            return new MessageError(error);
        }
    });

    // ApiResponse(ContractAPI.GET_CONTRACT_PAIR, async (msg) => {
    //     try {
    //         if (!msg) {
    //             return new MessageError('Invalid add contract pair parameters');
    //         }

    //         const { baseTokenId, oppositeTokenId, did, owner } = msg;

    //         const users = new Users();
    //         const wallet = new Wallet();
    //         const workers = new Workers();
    //         const root = await users.getUserById(did);
    //         const rootKey = await wallet.getKey(
    //             root.walletToken,
    //             KeyType.KEY,
    //             did
    //         );
    //         const baseToken = await new DatabaseServer().getToken(baseTokenId);
    //         const oppositeToken = await new DatabaseServer().getToken(
    //             oppositeTokenId
    //         );
    //         const contracts = await contractRepository.find({
    //             owner,
    //         });
    //         const contractPairs = [];
    //         for (const contract of contracts) {
    //             const contractPair = await workers.addNonRetryableTask(
    //                 {
    //                     type: WorkerTaskType.GET_CONTRACT_PAIR,
    //                     data: {
    //                         contractId: contract.contractId,
    //                         hederaAccountId: root.hederaAccountId,
    //                         hederaAccountKey: rootKey,
    //                         baseTokenId,
    //                         oppositeTokenId,
    //                     },
    //                 },
    //                 20
    //             );
    //             contractPairs.push({
    //                 baseTokenRate: baseToken?.decimals
    //                     ? contractPair.baseTokenRate /
    //                       Math.pow(10, baseToken.decimals)
    //                     : contractPair.baseTokenRate,
    //                 oppositeTokenRate: oppositeToken?.decimals
    //                     ? contractPair.oppositeTokenRate /
    //                       Math.pow(10, oppositeToken.decimals)
    //                     : contractPair.oppositeTokenRate,
    //                 contractId: contractPair.contractId,
    //                 description: contract.description,
    //             });
    //         }

    //         return new MessageResponse(contractPairs);
    //     } catch (error) {
    //         new Logger().error(error, ['GUARDIAN_SERVICE']);
    //         return new MessageError(error);
    //     }
    // });

    // ApiResponse(ContractAPI.ADD_RETIRE_REQUEST, async (msg) => {
    //     try {
    //         if (!msg) {
    //             return new MessageError('Invalid add contract pair parameters');
    //         }

    //         const baseTokenId = msg.baseTokenId || '';
    //         const oppositeTokenId = msg.oppositeTokenId || '';
    //         const {
    //             baseTokenCount,
    //             oppositeTokenCount,
    //             baseTokenSerials,
    //             oppositeTokenSerials,
    //             contractId,
    //             did,
    //         } = msg;

    //         const users = new Users();
    //         const wallet = new Wallet();
    //         const workers = new Workers();
    //         const root = await users.getUserById(did);
    //         const rootKey = await wallet.getKey(
    //             root.walletToken,
    //             KeyType.KEY,
    //             did
    //         );

    //         const baseToken = await new DatabaseServer().getToken(baseTokenId);
    //         const oppositeToken = await new DatabaseServer().getToken(
    //             oppositeTokenId
    //         );

    //         const addRequestResult = await workers.addNonRetryableTask(
    //             {
    //                 type: WorkerTaskType.ADD_RETIRE_REQUEST,
    //                 data: {
    //                     contractId,
    //                     hederaAccountId: root.hederaAccountId,
    //                     hederaAccountKey: rootKey,
    //                     baseTokenId,
    //                     oppositeTokenId,
    //                     baseTokenCount: baseToken?.decimals
    //                         ? Math.pow(10, baseToken.decimals) * baseTokenCount
    //                         : baseTokenCount,
    //                     oppositeTokenCount: oppositeToken?.decimals
    //                         ? Math.pow(10, oppositeToken.decimals) *
    //                           oppositeTokenCount
    //                         : oppositeTokenCount,
    //                     baseTokenSerials,
    //                     oppositeTokenSerials,
    //                 },
    //             },
    //             20
    //         );

    //         const contractRequest = await workers.addNonRetryableTask(
    //             {
    //                 type: WorkerTaskType.GET_RETIRE_REQUEST,
    //                 data: {
    //                     contractId,
    //                     hederaAccountId: root.hederaAccountId,
    //                     hederaAccountKey: rootKey,
    //                     baseTokenId,
    //                     oppositeTokenId,
    //                     userId: root.hederaAccountId,
    //                 },
    //             },
    //             20
    //         );

    //         await retireRequestRepository.save(
    //             {
    //                 contractId,
    //                 baseTokenId,
    //                 oppositeTokenId,
    //                 owner: did,
    //                 baseTokenCount: baseToken?.decimals
    //                     ? contractRequest.baseTokenCount /
    //                       Math.pow(10, baseToken.decimals)
    //                     : contractRequest.baseTokenCount,
    //                 oppositeTokenCount: oppositeToken?.decimals
    //                     ? contractRequest.oppositeTokenCount /
    //                       Math.pow(10, oppositeToken.decimals)
    //                     : contractRequest.oppositeTokenCount,
    //                 baseTokenSerials,
    //                 oppositeTokenSerials,
    //             },
    //             {
    //                 contractId,
    //                 $and: [
    //                     {
    //                         baseTokenId: {
    //                             $in: [baseTokenId, oppositeTokenId],
    //                         },
    //                     },
    //                     {
    //                         oppositeTokenId: {
    //                             $in: [baseTokenId, oppositeTokenId],
    //                         },
    //                     },
    //                 ],
    //                 owner: did,
    //                 documentId: null,
    //             }
    //         );

    //         return new MessageResponse(addRequestResult);
    //     } catch (error) {
    //         new Logger().error(error, ['GUARDIAN_SERVICE']);
    //         return new MessageError(error);
    //     }
    // });

    // ApiResponse(ContractAPI.CANCEL_RETIRE_REQUEST, async (msg) => {
    //     try {
    //         if (!msg) {
    //             return new MessageError('Invalid add contract pair parameters');
    //         }

    //         const { requestId, did } = msg;

    //         const retireRequest = await retireRequestRepository.findOne({
    //             id: requestId,
    //         });

    //         if (did !== retireRequest?.owner) {
    //             throw new Error('You are not owner of retire request');
    //         }

    //         const users = new Users();
    //         const wallet = new Wallet();
    //         const workers = new Workers();
    //         const root = await users.getUserById(did);
    //         const rootKey = await wallet.getKey(
    //             root.walletToken,
    //             KeyType.KEY,
    //             did
    //         );

    //         const cancelResult = await workers.addNonRetryableTask(
    //             {
    //                 type: WorkerTaskType.CANCEL_RETIRE_REQUEST,
    //                 data: {
    //                     contractId: retireRequest.contractId,
    //                     hederaAccountId: root.hederaAccountId,
    //                     hederaAccountKey: rootKey,
    //                     baseTokenId: retireRequest.baseTokenId,
    //                     oppositeTokenId: retireRequest.oppositeTokenId,
    //                 },
    //             },
    //             20
    //         );

    //         if (cancelResult) {
    //             await retireRequestRepository.remove(retireRequest);
    //         }

    //         return new MessageResponse(cancelResult);
    //     } catch (error) {
    //         new Logger().error(error, ['GUARDIAN_SERVICE']);
    //         return new MessageError(error);
    //     }
    // });

    // ApiResponse(ContractAPI.RETIRE_TOKENS, async (msg) => {
    //     try {
    //         if (!msg) {
    //             return new MessageError('Invalid add contract pair parameters');
    //         }

    //         const { requestId, did } = msg;

    //         const retireRequest = await retireRequestRepository.findOne({
    //             id: requestId,
    //         });

    //         const users = new Users();
    //         const wallet = new Wallet();
    //         const workers = new Workers();
    //         const root = await users.getUserById(did);
    //         const rootKey = await wallet.getKey(
    //             root.walletToken,
    //             KeyType.KEY,
    //             did
    //         );
    //         const retireRequestUser = await users.getUserById(
    //             retireRequest?.owner
    //         );
    //         const wipeKeys = [];
    //         const baseTokenWipeKey = await wallet.getUserKey(
    //             did,
    //             KeyType.TOKEN_WIPE_KEY,
    //             retireRequest.baseTokenId
    //         );
    //         if (baseTokenWipeKey) {
    //             wipeKeys.push(baseTokenWipeKey);
    //         }

    //         const oppositeTokenWipeKey = await wallet.getUserKey(
    //             did,
    //             KeyType.TOKEN_WIPE_KEY,
    //             retireRequest.oppositeTokenId
    //         );
    //         if (oppositeTokenWipeKey) {
    //             wipeKeys.push(oppositeTokenWipeKey);
    //         }

    //         const retireResult = await workers.addNonRetryableTask(
    //             {
    //                 type: WorkerTaskType.RETIRE_TOKENS,
    //                 data: {
    //                     contractId: retireRequest.contractId,
    //                     hederaAccountId: root.hederaAccountId,
    //                     hederaAccountKey: rootKey,
    //                     baseTokenId: retireRequest.baseTokenId,
    //                     oppositeTokenId: retireRequest.oppositeTokenId,
    //                     userId: retireRequestUser.hederaAccountId,
    //                     wipeKeys,
    //                 },
    //             },
    //             20
    //         );

    //         let topicConfig = await TopicConfig.fromObject(
    //             await new DataBaseHelper(Topic).findOne({
    //                 owner: did,
    //                 type: TopicType.RetireTopic,
    //             }),
    //             true
    //         );
    //         const parent = await TopicConfig.fromObject(
    //             await DatabaseServer.getTopicByType(did, TopicType.UserTopic),
    //             true
    //         );
    //         if (!topicConfig) {
    //             const topicHelper = new TopicHelper(
    //                 root.hederaAccountId,
    //                 rootKey
    //             );
    //             topicConfig = await topicHelper.create(
    //                 {
    //                     type: TopicType.RetireTopic,
    //                     name: TopicType.RetireTopic,
    //                     description: TopicType.RetireTopic,
    //                     owner: did,
    //                 },
    //                 {
    //                     admin: false,
    //                     submit: true,
    //                 }
    //             );
    //             await topicConfig.saveKeys();
    //             await topicHelper.twoWayLink(topicConfig, parent, null);
    //             await new DataBaseHelper(Topic).save(topicConfig.toObject());
    //         }

    //         let schema: SchemaCollection = null;

    //         schema = await new DataBaseHelper(SchemaCollection).findOne({
    //             entity: SchemaEntity.RETIRE_TOKEN,
    //             readonly: true,
    //             topicId: topicConfig.topicId,
    //         });
    //         const messageServer = new MessageServer(
    //             root.hederaAccountId,
    //             rootKey
    //         );
    //         messageServer.setTopicObject(topicConfig);
    //         if (!schema) {
    //             schema = await new DataBaseHelper(SchemaCollection).findOne({
    //                 entity: SchemaEntity.RETIRE_TOKEN,
    //                 system: true,
    //                 active: true,
    //             });
    //             if (schema) {
    //                 schema.creator = did;
    //                 schema.owner = did;
    //                 const item = await publishSystemSchema(
    //                     schema,
    //                     messageServer,
    //                     MessageAction.PublishSystemSchema
    //                 );
    //                 await new DataBaseHelper(SchemaCollection).save(item);
    //             }
    //         }

    //         const schemaObject = new Schema(schema);
    //         const vcHelper = new VcHelper();

    //         let credentialSubject: any = {
    //             baseTokenId: retireRequest.baseTokenId,
    //             oppositeTokenId: retireRequest.oppositeTokenId,
    //             baseTokenCount: retireRequest.baseTokenCount,
    //             oppositeTokenCount: retireRequest.oppositeTokenCount,
    //             userId: retireRequestUser.hederaAccountId,
    //             baseTokenSerials: retireRequest.baseTokenSerials,
    //             oppositeTokenSerials: retireRequest.oppositeTokenSerials,
    //         };
    //         credentialSubject.id = did;

    //         if (schemaObject) {
    //             credentialSubject = SchemaHelper.updateObjectContext(
    //                 schemaObject,
    //                 credentialSubject
    //             );
    //         }

    //         const vcObject = await vcHelper.createVC(
    //             did,
    //             rootKey,
    //             credentialSubject
    //         );
    //         const vcMessage = new VCMessage(MessageAction.CreateVC);
    //         vcMessage.setDocument(vcObject);
    //         await messageServer.sendMessage(vcMessage);

    //         const vcDoc = await new DataBaseHelper(VcDocumentCollection).save({
    //             hash: vcMessage.hash,
    //             owner: did,
    //             document: vcMessage.document,
    //             type: schemaObject?.entity,
    //         });

    //         await retireRequestRepository.update(
    //             {
    //                 documentId: vcDoc._id,
    //             },
    //             {
    //                 id: retireRequest.id,
    //             }
    //         );

    //         return new MessageResponse(retireResult);
    //     } catch (error) {
    //         new Logger().error(error, ['GUARDIAN_SERVICE']);
    //         return new MessageError(error);
    //     }
    // });
}
