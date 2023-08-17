// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;
pragma experimental ABIEncoderV2;

import "./ManageToken.sol";
import "./Access.sol";
import "./hedera-smart-contracts/safe-hts-precompile/SafeViewHTS.sol";
import "./hedera-smart-contracts/hts-precompile/IHederaTokenService.sol";
import "./Retire.sol";

contract RetireView is IRetire {
    constructor() {}

    function getPairs(address retireContractId)
        external
        view
        returns (
            address[] memory,
            address[] memory,
            int64[] memory,
            int64[] memory
        )
    {
        Retire retireContract = Retire(retireContractId);
        Pair[] memory pairs = retireContract.pairs();
        address[] memory bases = new address[](pairs.length);
        address[] memory opposites = new address[](pairs.length);
        int64[] memory baseCounts = new int64[](pairs.length);
        int64[] memory oppositeCounts = new int64[](pairs.length);
        for (uint256 i = 0; i < pairs.length; i++) {
            bases[i] = pairs[i].base;
            opposites[i] = pairs[i].opposite;
            baseCounts[i] = pairs[i].baseCount;
            oppositeCounts[i] = pairs[i].oppositeCount;
        }
        return (bases, opposites, baseCounts, oppositeCounts);
    }

    function getRequests(address retireContractId)
        external
        view
        returns (
            address[] memory,
            address[] memory,
            address[] memory,
            uint256[] memory,
            uint256[] memory
        )
    {
        Retire retireContract = Retire(retireContractId);
        Request[] memory requests = retireContract.requests();
        address[] memory accounts = new address[](requests.length);
        address[] memory bases = new address[](requests.length);
        address[] memory opposites = new address[](requests.length);
        uint256[] memory baseCounts = new uint256[](requests.length);
        uint256[] memory oppositeCounts = new uint256[](requests.length);
        for (uint256 i = 0; i < requests.length; i++) {
            accounts[i] = requests[i].account;
            bases[i] = requests[i].base;
            opposites[i] = requests[i].opposite;
            baseCounts[i] = requests[i].baseCount > 0
                ? uint256(uint64(requests[i].baseCount))
                : requests[i].baseSerials.length;
            oppositeCounts[i] = requests[i].oppositeCount > 0
                ? uint256(uint64(requests[i].oppositeCount))
                : requests[i].oppositeSerials.length;
        }
        return (bases, opposites, baseCounts, oppositeCounts);
    }
}
