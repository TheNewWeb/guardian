// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;
pragma experimental ABIEncoderV2;

import "./IRetire.sol";
import "./ManageToken.sol";
import "./Access.sol";
import "./RetirePairStorage.sol";
import "./RetireRequestStorage.sol";
import "./RetireStorageManager.sol";
import "./hedera-smart-contracts/safe-hts-precompile/SafeViewHTS.sol";
import "./hedera-smart-contracts/hts-precompile/IHederaTokenService.sol";

contract Retire is Access, SafeViewHTS, IRetire {
    event PairAdded(address indexed base, address indexed opposite);
    event RetireRequested(
        address indexed account,
        address indexed base,
        address indexed opposite
    );
    event RetireCompleted(
        address indexed account,
        address indexed base,
        address indexed opposite
    );

    bytes32 constant ADMIN = keccak256("ADMIN");

    RetireStorageManager storageManager;
    RetirePairStorage pairStorage;
    RetireRequestStorage requestStorage;

    constructor() {
        _setRole(msg.sender, ADMIN);
        storageManager = new RetireStorageManager();
        pairStorage = initPairStorage();
        requestStorage = initRequestStorage();
    }

    function initPairStorage() private returns (RetirePairStorage) {
        (bool success, bytes memory result) = address(storageManager)
            .delegatecall(
                abi.encodeWithSelector(
                    RetireStorageManager.pairStorage.selector
                )
            );
        require(success);
        return abi.decode(result, (RetirePairStorage));
    }

    function initRequestStorage() private returns (RetireRequestStorage) {
        (bool success, bytes memory result) = address(storageManager)
            .delegatecall(
                abi.encodeWithSelector(
                    RetireStorageManager.requestStorage.selector
                )
            );
        require(success);
        return abi.decode(result, (RetireRequestStorage));
    }

    function requests() public view returns (Request[] memory) {
        return requestStorage.getRequests();
    }

    function pairs() public view returns (Pair[] memory) {
        return pairStorage.getPairs();
    }

    function addAdmin(address account) external role(OWNER) {
        _setRole(account, ADMIN);
    }

    function removeAdmin(address account) external role(OWNER) {
        _unsetRole(account, ADMIN);
    }

    function removePair(address base, address opposite) external role(ADMIN) {
        pairStorage.removePair(base, opposite);
    }

    function clearPairs() external role(ADMIN) {
        pairStorage = initPairStorage();
    }

    function clearRequests() external role(ADMIN) {
        requestStorage = initRequestStorage();
    }

    function removeRequest(
        address account,
        address base,
        address opposite
    ) external role(ADMIN) {
        requestStorage.removeRequest(account, base, opposite);
    }

    function getTokenContract(address token) private returns (ManageToken) {
        IHederaTokenService.KeyValue memory key = SafeViewHTS.safeGetTokenKey(
            token,
            8
        );
        require(
            key.contractId != address(0) ||
                key.delegatableContractId != address(0),
            "NO_CONTRACT"
        );
        return
            key.contractId != address(0)
                ? ManageToken(key.contractId)
                : ManageToken(key.delegatableContractId);
    }

    function pairAvailable(address base, address opposite)
        public
        returns (bool)
    {
        ManageToken baseContract = getTokenContract(base);
        ManageToken oppositeContract = getTokenContract(opposite);
        return baseContract.isWiper() && oppositeContract.isWiper();
    }

    function setPair(
        address base,
        address opposite,
        int64 baseCount,
        int64 oppositeCount,
        bool immediately
    ) external role(ADMIN) {
        pairStorage.setPair(
            base,
            opposite,
            baseCount,
            oppositeCount,
            immediately
        );
        ManageToken baseContract = getTokenContract(base);
        ManageToken oppositeContract = getTokenContract(opposite);

        if (!baseContract.isWiper()) {
            baseContract.requestWiper();
        }
        if (!oppositeContract.isWiper()) {
            oppositeContract.requestWiper();
        }
        emit PairAdded(base, opposite);
    }

    function ratio(address base, address opposite)
        external
        view
        returns (int64, int64)
    {
        Pair memory pair = pairStorage.getPair(base, opposite);
        return (pair.baseCount, pair.oppositeCount);
    }

    function requestRatio(
        address account,
        address base,
        address opposite
    )
        external
        view
        returns (
            int64,
            int64,
            int64[] memory,
            int64[] memory
        )
    {
        Request memory request = requestStorage.getRequest(
            account,
            base,
            opposite
        );
        return (
            request.baseCount,
            request.oppositeCount,
            request.baseSerials,
            request.oppositeSerials
        );
    }

    function _wipeCheck(
        int64 baseCountPair,
        int64 oppositeCountPair,
        int64 baseCount,
        int64 oppositeCount
    ) private pure returns (bool) {
        return
            (baseCount >= baseCountPair) &&
            (oppositeCount >= oppositeCountPair) &&
            (((baseCountPair > 0 && oppositeCountPair > 0) &&
                (baseCount / oppositeCount) ==
                (baseCountPair / oppositeCountPair)) ||
                (baseCountPair > 0 || oppositeCountPair > 0));
    }

    function _wipe(
        ManageToken baseContract,
        ManageToken oppositeContract,
        address base,
        address opposite,
        int64 baseCount,
        int64 oppositeCount,
        int64[] memory baseSerials,
        int64[] memory oppositeSerials
    ) private {
        if (baseCount > 0) {
            baseContract.wipe(base, msg.sender, baseCount);
        }
        if (oppositeCount > 0) {
            oppositeContract.wipe(opposite, msg.sender, oppositeCount);
        }
        if (baseSerials.length > 0) {
            baseContract.wipeNFT(base, msg.sender, baseSerials);
        }
        if (oppositeSerials.length > 0) {
            oppositeContract.wipeNFT(opposite, msg.sender, oppositeSerials);
        }
    }

    function approveRetire(
        address account,
        address base,
        address opposite
    ) external role(ADMIN) {
        Request memory request = requestStorage.getRequest(
            account,
            base,
            opposite
        );
        _wipe(
            getTokenContract(base),
            getTokenContract(opposite),
            base,
            opposite,
            request.baseCount,
            request.oppositeCount,
            request.baseSerials,
            request.oppositeSerials
        );
        emit RetireCompleted(msg.sender, base, opposite);
    }

    function retire(
        address base,
        address opposite,
        int64 baseCount,
        int64 oppositeCount,
        int64[] calldata baseSerials,
        int64[] calldata oppositeSerials
    ) external returns (bool) {
        Pair memory pair = pairStorage.getPair(base, opposite);
        int32 baseType = safeGetTokenType(base);
        int32 oppositeType = safeGetTokenType(opposite);
        require(pairAvailable(base, opposite), "PAIR_NOT_AVAILABLE");
        require(
            _wipeCheck(
                pair.baseCount,
                pair.oppositeCount,
                baseType == 0 ? baseCount : int64(int256(baseSerials.length)),
                oppositeType == 0
                    ? oppositeCount
                    : int64(int256(oppositeSerials.length))
            ),
            "WIPE_CHECK_ERROR"
        );
        if (pair.immediately) {
            _wipe(
                getTokenContract(base),
                getTokenContract(opposite),
                base,
                opposite,
                baseType == 0 ? baseCount : int64(0),
                oppositeType == 0 ? oppositeCount : int64(0),
                baseType == 1 ? baseSerials : new int64[](0),
                oppositeType == 1 ? oppositeSerials : new int64[](0)
            );
            emit RetireCompleted(msg.sender, base, opposite);
        } else {
            requestStorage.setRequest(
                msg.sender,
                base,
                opposite,
                baseType == 0 ? baseCount : int64(0),
                oppositeType == 0 ? oppositeCount : int64(0),
                baseType == 1 ? baseSerials : new int64[](0),
                oppositeType == 1 ? oppositeSerials : new int64[](0)
            );
            emit RetireRequested(msg.sender, base, opposite);
        }
        return pair.immediately;
    }
}
