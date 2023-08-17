// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;
pragma experimental ABIEncoderV2;

import "./ManageToken.sol";
import "./Access.sol";
import "./hedera-smart-contracts/safe-hts-precompile/SafeViewHTS.sol";
import "./hedera-smart-contracts/hts-precompile/IHederaTokenService.sol";
import "./IRetire.sol";
import "./RetirePairStorage.sol";
import "./RetireRequestStorage.sol";

contract Retire is Access, SafeViewHTS, IRetire {
    bytes32 public constant ADMIN = keccak256("ADMIN");

    constructor() {
        _setRole(msg.sender, ADMIN);
    }

    RetirePairStorage pairStorage = new RetirePairStorage();
    RetireRequestStorage requestStorage = new RetireRequestStorage();

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

    function removeRequest(address account, address base, address opposite) external role(ADMIN) {
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
    }

    function ratio(address base, address opposite)
        external
        view
        returns (int64, int64)
    {
        Pair memory pair = pairStorage.getPair(base, opposite);
        return (pair.baseCount, pair.oppositeCount);
    }

    function requestRatio(address account, address base, address opposite)
        external
        view
        returns (int64, int64, int64[] memory, int64[] memory)
    {
        Request memory request = requestStorage.getRequest(account, base, opposite);
        return (request.baseCount, request.oppositeCount, request.baseSerials, request.oppositeSerials);
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

    function approveWipe(
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
    }

    function wipe(
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
        }
    }
}
