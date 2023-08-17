// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;
pragma experimental ABIEncoderV2;

import "./ManageToken.sol";
import "./Access.sol";
import "./hedera-smart-contracts/safe-hts-precompile/SafeViewHTS.sol";
import "./hedera-smart-contracts/hts-precompile/IHederaTokenService.sol";
import "./Utils.sol";
import "./IRetire.sol";

contract RetirePairStorage is Access, SafeViewHTS, IRetire {
    constructor() {
        _setRole(msg.sender, OWNER);
    }

    Pair[] pairs;
    mapping(address => mapping(address => uint256)) pairPos;

    function getPairs() public view role(OWNER) returns (Pair[] memory) {
        return pairs;
    }

    function removePair(address base, address opposite) public role(OWNER) {
        Pair storage pair = pairs[pairPos[base][opposite] - 1];
        Pair storage last = pairs[pairs.length - 1];
        pairPos[last.base][last.opposite] = pairPos[pair.base][pair.opposite];
        pairPos[last.opposite][last.base] = pairPos[pair.opposite][pair.base];
        delete pairPos[pair.base][pair.opposite];
        delete pairPos[pair.opposite][pair.base];
        pair = last;
        pairs.pop();
    }

    function setPair(
        address base,
        address opposite,
        int64 baseCount,
        int64 oppositeCount,
        bool immediately
    ) public role(OWNER) {
        require(
            (base != address(0) && baseCount > 0) ||
                (opposite != address(0) && oppositeCount > 0),
            "INVALID_RATIO"
        );
        if (pairPos[base][opposite] > 0) {
            removePair(base, opposite);
        }
        pairs.push(Pair(base, opposite, baseCount, oppositeCount, immediately));
        pairPos[base][opposite] = pairs.length;
        pairPos[opposite][base] = pairs.length;
    }

    function getPair(address base, address opposite)
        public
        view
        role(OWNER)
        returns (Pair memory)
    {
        Pair memory pair = pairs[pairPos[base][opposite]];
        bool inverted = base == pair.opposite;
        return
            inverted
                ? Pair(
                    opposite,
                    base,
                    pair.oppositeCount,
                    pair.baseCount,
                    pair.immediately
                )
                : Pair(
                    base,
                    opposite,
                    pair.baseCount,
                    pair.oppositeCount,
                    pair.immediately
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
}
