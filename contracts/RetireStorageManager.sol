// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;
pragma experimental ABIEncoderV2;
import "./RetirePairStorage.sol";
import "./RetireRequestStorage.sol";

// Should be as library (ideal, but in this case libraryId will be needed to passed in Retire contract constructor).
// Using as fabric to except issue with retire contract size.
contract RetireStorageManager {
    function pairStorage() public returns (RetirePairStorage) {
        return new RetirePairStorage();
    }

    function requestStorage() public returns (RetireRequestStorage) {
        return new RetireRequestStorage();
    }
}
