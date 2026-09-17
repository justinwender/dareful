// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Script, console } from "forge-std/Script.sol";
import { DarefulLedger } from "../src/DarefulLedger.sol";
import { DarefulDares } from "../src/DarefulDares.sol";

/// @notice Deploys DarefulLedger and DarefulDares with the relayer as the trusted role, then wires the
///         ledger to the dares contract. The deployer key is the relayer key.
///
///         forge script script/Deploy.s.sol --rpc-url $MONAD_RPC_URL --broadcast
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("RELAYER_PRIVATE_KEY");
        address relayer = vm.addr(pk);

        vm.startBroadcast(pk);
        DarefulLedger ledger = new DarefulLedger(relayer);
        DarefulDares dares = new DarefulDares(ledger, relayer);
        ledger.setDares(address(dares));
        vm.stopBroadcast();

        console.log("RELAYER_ADDRESS=%s", relayer);
        console.log("DAREFUL_LEDGER_ADDRESS=%s", address(ledger));
        console.log("DAREFUL_DARES_ADDRESS=%s", address(dares));
    }
}
