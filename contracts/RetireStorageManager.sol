// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;
pragma experimental ABIEncoderV2;
import "./RetirePairStorage.sol";
import "./RetireRequestStorage.sol";

contract RetireStorageManager {
    function pairStorage() public returns (RetirePairStorage) {
        return new RetirePairStorage();
    }

    function requestStorage() public returns (RetireRequestStorage) {
        return new RetireRequestStorage();
    }
}
