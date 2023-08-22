// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;
pragma experimental ABIEncoderV2;

import "./IRetire.sol";
import "./Wipe.sol";
import "./Access.sol";
import "./RetirePairStorage.sol";
import "./RetireRequestStorage.sol";
import "./RetireStorageManager.sol";
import "./safe-hts-precompile/SafeViewHTS.sol";
import "./hts-precompile/IHederaTokenService.sol";

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

    function pairAvailable(address base, address opposite)
        public
        returns (bool)
    {
        return
            base == address(0) ||
            (opposite == address(0) &&
                tokenContract(base).isWiper() &&
                tokenContract(opposite).isWiper());
    }

    function contractType() external pure returns (string memory) {
        return "RETIRE";
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

    function unsetPair(address base, address opposite) external role(ADMIN) {
        pairStorage.unsetPair(base, opposite);
    }

    function clearPairs() external role(ADMIN) {
        pairStorage = initPairStorage();
    }

    function clearRequests() external role(ADMIN) {
        requestStorage = initRequestStorage();
    }

    function unsetRequest(
        address account,
        address base,
        address opposite
    ) external role(ADMIN) {
        requestStorage.unsetRequest(account, base, opposite);
    }

    function cancelRequest(address base, address opposite) external {
        requestStorage.unsetRequest(msg.sender, base, opposite);
    }

    function tokenContract(address token) private returns (Wipe) {
        if (token == address(0)) {
            return Wipe(address(0));
        }
        IHederaTokenService.KeyValue memory key = SafeViewHTS.safeGetTokenKey(
            token,
            8
        );
        return
            key.contractId != address(0)
                ? Wipe(key.contractId)
                : Wipe(key.delegatableContractId);
    }

    function setPair(
        address base,
        address opposite,
        int64 baseCount,
        int64 oppositeCount,
        bool immediately
    ) external role(ADMIN) {
        Wipe baseContract = tokenContract(base);
        Wipe oppositeContract = tokenContract(opposite);
        if (
            baseContract != Wipe(address(0)) &&
            !baseContract.isWiper() &&
            !baseContract.banned()
        ) {
            baseContract.requestWiper();
        }
        if (
            oppositeContract != Wipe(address(0)) &&
            !oppositeContract.isWiper() &&
            !oppositeContract.banned()
        ) {
            oppositeContract.requestWiper();
        }
        pairStorage.setPair(
            base,
            opposite,
            baseCount,
            oppositeCount,
            immediately
        );
        emit PairAdded(base, opposite);
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
                ((baseCountPair > 0 && oppositeCount == 0) || (oppositeCountPair > 0 && baseCount == 0)));
    }

    function _wipe(
        address base,
        address opposite,
        int64 baseCount,
        int64 oppositeCount,
        int64[] memory baseSerials,
        int64[] memory oppositeSerials
    ) private {
        Wipe baseContract = tokenContract(base);
        Wipe oppositeContract = tokenContract(opposite);
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
    ) external {
        Pair memory pair = pairStorage.getPair(base, opposite);
        int32 baseType = safeGetTokenType(base);
        int32 oppositeType = safeGetTokenType(opposite);
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
    }

    function permissions() public view returns (uint8) {
        uint8 result = 0;
        if (_hasRole(msg.sender, OWNER)) {
            result += 2; // 10
        }
        if (_hasRole(msg.sender, ADMIN)) {
            result += 1; // 01
        }
        return result;
    }
}
