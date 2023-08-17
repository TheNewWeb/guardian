// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;
pragma experimental ABIEncoderV2;

import "./ManageToken.sol";
import "./Access.sol";
import "./hedera-smart-contracts/safe-hts-precompile/SafeViewHTS.sol";
import "./hedera-smart-contracts/hts-precompile/IHederaTokenService.sol";
import "./Utils.sol";
import "./IRetire.sol";

contract RetireRequestStorage is Access, SafeViewHTS, IRetire {
    constructor() {
        _setRole(msg.sender, OWNER);
    }

    Request[] requests;
    mapping(address => mapping(address => mapping(address => uint256))) requestPos;

    function getRequests() public view role(OWNER) returns (Request[] memory) {
        return requests;
    }

    function getRequest(
        address account,
        address base,
        address opposite
    ) public view role(OWNER) returns (Request memory) {
        Request memory request = requests[requestPos[account][base][opposite]];
        bool inverted = base == request.opposite;
        return
            inverted
                ? Request(
                    account,
                    opposite,
                    base,
                    request.oppositeCount,
                    request.baseCount,
                    request.oppositeSerials,
                    request.baseSerials
                )
                : Request(
                    account,
                    base,
                    opposite,
                    request.baseCount,
                    request.oppositeCount,
                    request.baseSerials,
                    request.oppositeSerials
                );
    }

    function removeRequest(
        address account,
        address base,
        address opposite
    ) public role(OWNER) {
        Request storage req = requests[requestPos[account][base][opposite] - 1];
        Request storage last = requests[requests.length - 1];
        requestPos[account][last.base][last.opposite] = requestPos[account][
            req.base
        ][req.opposite];
        requestPos[account][last.opposite][last.base] = requestPos[account][
            req.opposite
        ][req.base];
        delete requestPos[account][req.base][req.opposite];
        delete requestPos[account][req.opposite][req.base];
        req = last;
        requests.pop();
    }

    function setRequest(
        address account,
        address base,
        address opposite,
        int64 baseCount,
        int64 oppositeCount,
        int64[] memory baseSerials,
        int64[] memory oppositeSerials
    ) public role(OWNER) {
        require(
            (account != address(0) && (base != address(0) && baseCount > 0)) ||
                (opposite != address(0) && oppositeCount > 0),
            "INVALID_RATIO"
        );
        if (requestPos[account][base][opposite] > 0) {
            removeRequest(account, base, opposite);
        }
        requests.push(
            Request(
                account,
                base,
                opposite,
                baseCount,
                oppositeCount,
                baseSerials,
                oppositeSerials
            )
        );
        requestPos[account][base][opposite] = requests.length;
        requestPos[account][opposite][base] = requests.length;
    }
}
