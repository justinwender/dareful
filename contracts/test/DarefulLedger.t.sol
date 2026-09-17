// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { DarefulTestBase } from "./Base.t.sol";
import { DarefulLedger } from "../src/DarefulLedger.sol";
import { IERC1155Errors } from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

contract DarefulLedgerTest is DarefulTestBase {
    // ------------------------------------------------------------------ confirm

    function test_ConfirmMintsToCreditorUnderSpecTokenId() public {
        uint256 id = confirmBetween(0, 1, USD, 4720, ob(1));
        assertEq(id, uint256(keccak256(abi.encode(GROUP, USD, users[0].ledger))));
        assertEq(ledger.balanceOf(users[1].ledger, id), 4720);
        assertEq(ledger.balanceOf(users[0].ledger, id), 0);
        DarefulLedger.Obligation memory o = ledger.obligationOf(ob(1));
        assertEq(o.tokenId, id);
        assertEq(o.creditor, users[1].ledger);
        assertEq(o.minted, 4720);
        assertEq(o.closed, 0);
    }

    function test_ConfirmEmitsConfirmed() public {
        uint256 id = ledger.fungibleId(GROUP, USD, users[0].ledger);
        vm.expectEmit(true, true, true, true);
        emit DarefulLedger.Confirmed(GROUP, USD, users[0].ledger, users[1].ledger, id, 300, ob(7), false);
        confirmBetween(0, 1, USD, 300, ob(7));
    }

    function test_TwoCreditorsShareOneFungibleId() public {
        confirmBetween(0, 1, BEER, 2, ob(1));
        confirmBetween(0, 2, BEER, 3, ob(2));
        uint256 id = ledger.fungibleId(GROUP, BEER, users[0].ledger);
        assertEq(ledger.balanceOf(users[1].ledger, id), 2);
        assertEq(ledger.balanceOf(users[2].ledger, id), 3);
    }

    function test_ConfirmRejectsReusedObligationId() public {
        confirmBetween(0, 1, USD, 100, ob(1));
        bytes memory sig = signConfirm(users[2].ledgerPk, GROUP, USD, users[1].ledger, 100, ob(1), false);
        vm.expectRevert(abi.encodeWithSelector(DarefulLedger.ObligationExists.selector, ob(1)));
        ledger.confirm(GROUP, USD, users[1].ledger, 100, ob(1), false, sig);
    }

    function test_ConfirmRejectsNonMemberCreditor() public {
        address stranger = address(0x5717);
        bytes memory sig = signConfirm(users[0].ledgerPk, GROUP, USD, stranger, 100, ob(1), false);
        vm.expectRevert(abi.encodeWithSelector(DarefulLedger.NotMember.selector, GROUP, stranger));
        ledger.confirm(GROUP, USD, stranger, 100, ob(1), false, sig);
    }

    function test_ConfirmRejectsNonMemberDebtor() public {
        uint256 strangerPk = 0xA11CE;
        bytes memory sig = signConfirm(strangerPk, GROUP, USD, users[1].ledger, 100, ob(1), false);
        vm.expectRevert(abi.encodeWithSelector(DarefulLedger.NotMember.selector, GROUP, vm.addr(strangerPk)));
        ledger.confirm(GROUP, USD, users[1].ledger, 100, ob(1), false, sig);
    }

    function test_ConfirmSignatureOverDifferentParametersDoesNotMint() public {
        // Signed for 100, submitted for 1000: the recovered address is not a member, so nothing mints.
        bytes memory sig = signConfirm(users[0].ledgerPk, GROUP, USD, users[1].ledger, 100, ob(1), false);
        vm.expectRevert();
        ledger.confirm(GROUP, USD, users[1].ledger, 1000, ob(1), false, sig);
        assertEq(owed(0, 1, USD), 0);
    }

    function test_ConfirmRejectsUnknownDenom() public {
        bytes32 bogus = keccak256("denom:bogus");
        bytes memory sig = signConfirm(users[0].ledgerPk, GROUP, bogus, users[1].ledger, 1, ob(1), false);
        vm.expectRevert(abi.encodeWithSelector(DarefulLedger.UnknownDenom.selector, GROUP, bogus));
        ledger.confirm(GROUP, bogus, users[1].ledger, 1, ob(1), false, sig);
    }

    function test_ConfirmRejectsSelfObligation() public {
        bytes memory sig = signConfirm(users[0].ledgerPk, GROUP, USD, users[0].ledger, 1, ob(1), false);
        vm.expectRevert(DarefulLedger.SelfObligation.selector);
        ledger.confirm(GROUP, USD, users[0].ledger, 1, ob(1), false, sig);
    }

    function test_ConfirmRejectsZeroQuantity() public {
        bytes memory sig = signConfirm(users[0].ledgerPk, GROUP, USD, users[1].ledger, 0, ob(1), false);
        vm.expectRevert(DarefulLedger.BadQuantity.selector);
        ledger.confirm(GROUP, USD, users[1].ledger, 0, ob(1), false, sig);
    }

    function test_UnquantifiableMintsExactlyOneUnit() public {
        bytes memory sig = signConfirm(users[0].ledgerPk, GROUP, NEXT, users[1].ledger, 2, ob(1), false);
        vm.expectRevert(DarefulLedger.UnquantifiableQuantity.selector);
        ledger.confirm(GROUP, NEXT, users[1].ledger, 2, ob(1), false, sig);

        confirmBetween(0, 1, NEXT, 1, ob(1));
        confirmBetween(0, 1, NEXT, 1, ob(2));
        assertEq(owed(0, 1, NEXT), 2, "two next-times, one unit each");
    }

    function test_UniqueObligationUsesItsOwnIdAndOneUnit() public {
        bytes memory bad = signConfirm(users[0].ledgerPk, GROUP, BEER, users[1].ledger, 2, ob(1), true);
        vm.expectRevert(DarefulLedger.UnquantifiableQuantity.selector);
        ledger.confirm(GROUP, BEER, users[1].ledger, 2, ob(1), true, bad);

        bytes memory sig = signConfirm(users[0].ledgerPk, GROUP, BEER, users[1].ledger, 1, ob(1), true);
        ledger.confirm(GROUP, BEER, users[1].ledger, 1, ob(1), true, sig);
        uint256 uid = uint256(keccak256(abi.encode(GROUP, BEER, users[0].ledger, ob(1))));
        assertEq(uid, ledger.uniqueId(GROUP, BEER, users[0].ledger, ob(1)));
        assertEq(ledger.balanceOf(users[1].ledger, uid), 1);
        assertEq(owed(0, 1, BEER), 0, "unique obligations do not touch the fungible edge");
    }

    // ------------------------------------------------------------------ non-transferability

    function test_TransferRevertsForHolder() public {
        uint256 id = confirmBetween(0, 1, USD, 100, ob(1));
        vm.prank(users[1].ledger);
        vm.expectRevert(bytes("non-transferable"));
        ledger.safeTransferFrom(users[1].ledger, users[2].ledger, id, 50, "");
    }

    function test_BatchTransferRevertsForHolder() public {
        uint256 id = confirmBetween(0, 1, USD, 100, ob(1));
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 100;
        vm.prank(users[1].ledger);
        vm.expectRevert(bytes("non-transferable"));
        ledger.safeBatchTransferFrom(users[1].ledger, users[2].ledger, ids, amounts, "");
    }

    function test_TransferRevertsForApprovedOperator() public {
        uint256 id = confirmBetween(0, 1, USD, 100, ob(1));
        vm.prank(users[1].ledger);
        ledger.setApprovalForAll(users[3].ledger, true);
        assertTrue(ledger.isApprovedForAll(users[1].ledger, users[3].ledger));

        vm.prank(users[3].ledger);
        vm.expectRevert(bytes("non-transferable"));
        ledger.safeTransferFrom(users[1].ledger, users[3].ledger, id, 100, "");

        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1;
        vm.prank(users[3].ledger);
        vm.expectRevert(bytes("non-transferable"));
        ledger.safeBatchTransferFrom(users[1].ledger, users[3].ledger, ids, amounts, "");
    }

    function test_TransferRevertsEvenBackToDebtor() public {
        uint256 id = confirmBetween(0, 1, USD, 100, ob(1));
        vm.prank(users[1].ledger);
        vm.expectRevert(bytes("non-transferable"));
        ledger.safeTransferFrom(users[1].ledger, users[0].ledger, id, 100, "");
    }

    function test_TransferOfUniqueRevertsToo() public {
        bytes memory sig = signConfirm(users[0].ledgerPk, GROUP, BEER, users[1].ledger, 1, ob(1), true);
        ledger.confirm(GROUP, BEER, users[1].ledger, 1, ob(1), true, sig);
        uint256 uid = ledger.uniqueId(GROUP, BEER, users[0].ledger, ob(1));
        vm.prank(users[1].ledger);
        vm.expectRevert(bytes("non-transferable"));
        ledger.safeTransferFrom(users[1].ledger, users[2].ledger, uid, 1, "");
    }

    // ------------------------------------------------------------------ confirmMany

    function _batch()
        internal
        view
        returns (
            bytes32[] memory g,
            bytes32[] memory d,
            address[] memory c,
            uint256[] memory q,
            bytes16[] memory o,
            bool[] memory u
        )
    {
        g = new bytes32[](3);
        d = new bytes32[](3);
        c = new address[](3);
        q = new uint256[](3);
        o = new bytes16[](3);
        u = new bool[](3);
        g[0] = GROUP;
        g[1] = GROUP;
        g[2] = GROUP;
        d[0] = USD;
        d[1] = BEER;
        d[2] = USD;
        c[0] = users[1].ledger;
        c[1] = users[2].ledger;
        c[2] = users[1].ledger;
        q[0] = 1200;
        q[1] = 2;
        q[2] = 300;
        o[0] = ob(10);
        o[1] = ob(11);
        o[2] = ob(12);
    }

    function test_ConfirmManyMintsEverythingUnderOneSignature() public {
        (bytes32[] memory g, bytes32[] memory d, address[] memory c, uint256[] memory q, bytes16[] memory o, bool[] memory u)
        = _batch();
        bytes memory sig = signConfirmMany(users[0].ledgerPk, g, d, c, q, o, u);
        ledger.confirmMany(g, d, c, q, o, u, sig);
        assertEq(owed(0, 1, USD), 1500, "two USD obligations to the same creditor add up");
        assertEq(owed(0, 2, BEER), 2);
        assertEq(ledger.obligationOf(ob(10)).minted, 1200);
        assertEq(ledger.obligationOf(ob(11)).minted, 2);
        assertEq(ledger.obligationOf(ob(12)).minted, 300);
    }

    function test_ConfirmManyIsAtomic() public {
        (bytes32[] memory g, bytes32[] memory d, address[] memory c, uint256[] memory q, bytes16[] memory o, bool[] memory u)
        = _batch();
        d[2] = keccak256("denom:bogus");
        bytes memory sig = signConfirmMany(users[0].ledgerPk, g, d, c, q, o, u);
        vm.expectRevert(abi.encodeWithSelector(DarefulLedger.UnknownDenom.selector, GROUP, d[2]));
        ledger.confirmMany(g, d, c, q, o, u, sig);
        assertEq(owed(0, 1, USD), 0);
        assertEq(owed(0, 2, BEER), 0);
    }

    function test_ConfirmManyRejectsLengthMismatch() public {
        (bytes32[] memory g, bytes32[] memory d, address[] memory c, uint256[] memory q, bytes16[] memory o, bool[] memory u)
        = _batch();
        bytes memory sig = signConfirmMany(users[0].ledgerPk, g, d, c, q, o, u);
        uint256[] memory shortQ = new uint256[](2);
        vm.expectRevert(DarefulLedger.LengthMismatch.selector);
        ledger.confirmMany(g, d, c, shortQ, o, u, sig);
    }

    function test_ConfirmManySignatureCoversTheWholeBatch() public {
        (bytes32[] memory g, bytes32[] memory d, address[] memory c, uint256[] memory q, bytes16[] memory o, bool[] memory u)
        = _batch();
        bytes memory sig = signConfirmMany(users[0].ledgerPk, g, d, c, q, o, u);
        q[0] = 999_999; // tamper after signing
        vm.expectRevert();
        ledger.confirmMany(g, d, c, q, o, u, sig);
    }

    // ------------------------------------------------------------------ close

    function test_CloseBurnsAndRecordsReason() public {
        uint256 id = confirmBetween(0, 1, USD, 1000, ob(1));
        bytes memory sig = signClose(users[1].ledgerPk, id, 400, DarefulLedger.CloseReason.Settled, ob(1), 0);
        vm.expectEmit(true, true, true, true);
        emit DarefulLedger.Closed(id, users[1].ledger, 400, DarefulLedger.CloseReason.Settled, ob(1));
        ledger.close(id, 400, DarefulLedger.CloseReason.Settled, ob(1), sig);
        assertEq(owed(0, 1, USD), 600);

        sig = signClose(users[1].ledgerPk, id, 600, DarefulLedger.CloseReason.Forgiven, ob(1), 1);
        ledger.close(id, 600, DarefulLedger.CloseReason.Forgiven, ob(1), sig);
        assertEq(owed(0, 1, USD), 0);
        assertEq(ledger.obligationOf(ob(1)).closed, 1000);
    }

    function test_CloseRejectsReplay() public {
        uint256 id = confirmBetween(0, 1, USD, 1000, ob(1));
        bytes memory sig = signClose(users[1].ledgerPk, id, 100, DarefulLedger.CloseReason.Settled, ob(1), 0);
        ledger.close(id, 100, DarefulLedger.CloseReason.Settled, ob(1), sig);
        vm.expectRevert();
        ledger.close(id, 100, DarefulLedger.CloseReason.Settled, ob(1), sig);
        assertEq(owed(0, 1, USD), 900);
    }

    function test_CloseRejectsNonCreditor() public {
        uint256 id = confirmBetween(0, 1, USD, 1000, ob(1));
        bytes memory sig = signClose(users[0].ledgerPk, id, 100, DarefulLedger.CloseReason.Settled, ob(1), 0);
        vm.expectRevert(abi.encodeWithSelector(DarefulLedger.NotCreditor.selector, ob(1), users[0].ledger));
        ledger.close(id, 100, DarefulLedger.CloseReason.Settled, ob(1), sig);
    }

    function test_CloseRejectsMoreThanTheObligation() public {
        uint256 id = confirmBetween(0, 1, USD, 1000, ob(1));
        confirmBetween(0, 1, USD, 5000, ob(2)); // same fungible id, so the balance is 6000
        bytes memory sig = signClose(users[1].ledgerPk, id, 1001, DarefulLedger.CloseReason.Settled, ob(1), 0);
        vm.expectRevert(abi.encodeWithSelector(DarefulLedger.ExceedsObligation.selector, ob(1), 1000, 0, 1001));
        ledger.close(id, 1001, DarefulLedger.CloseReason.Settled, ob(1), sig);
    }

    function test_CloseRejectsTokenMismatch() public {
        confirmBetween(0, 1, USD, 1000, ob(1));
        uint256 wrongId = ledger.fungibleId(GROUP, BEER, users[0].ledger);
        bytes memory sig = signClose(users[1].ledgerPk, wrongId, 1, DarefulLedger.CloseReason.Settled, ob(1), 0);
        vm.expectRevert(abi.encodeWithSelector(DarefulLedger.TokenMismatch.selector, ob(1), wrongId));
        ledger.close(wrongId, 1, DarefulLedger.CloseReason.Settled, ob(1), sig);
    }

    function test_CloseRejectsUnknownObligation() public {
        bytes memory sig = signClose(users[1].ledgerPk, 1, 1, DarefulLedger.CloseReason.Settled, ob(99), 0);
        vm.expectRevert(abi.encodeWithSelector(DarefulLedger.UnknownObligation.selector, ob(99)));
        ledger.close(1, 1, DarefulLedger.CloseReason.Settled, ob(99), sig);
    }

    // ------------------------------------------------------------------ net

    function test_NetBurnsMinOfReciprocalEdges() public {
        confirmBetween(0, 1, USD, 500, ob(1)); // 0 owes 1: 500
        confirmBetween(1, 0, USD, 300, ob(2)); // 1 owes 0: 300
        bytes memory sig = signNet(users[0].ledgerPk, GROUP, USD, users[0].ledger, users[1].ledger, 0);
        vm.expectEmit(true, true, true, true);
        emit DarefulLedger.Netted(GROUP, USD, users[0].ledger, users[1].ledger, 300);
        ledger.net(GROUP, USD, users[0].ledger, users[1].ledger, sig);
        assertEq(owed(0, 1, USD), 200);
        assertEq(owed(1, 0, USD), 0);
    }

    function test_NetEitherPartyMaySignAndPairOrderDoesNotMatter() public {
        confirmBetween(0, 1, BEER, 2, ob(1));
        confirmBetween(1, 0, BEER, 5, ob(2));
        // b signs, with the pair written the other way round
        bytes memory sig = signNet(users[1].ledgerPk, GROUP, BEER, users[1].ledger, users[0].ledger, 0);
        ledger.net(GROUP, BEER, users[1].ledger, users[0].ledger, sig);
        assertEq(owed(0, 1, BEER), 0);
        assertEq(owed(1, 0, BEER), 3);
        assertEq(ledger.netNonceOf(GROUP, BEER, users[0].ledger, users[1].ledger), 1);
    }

    function test_NetRejectsThirdParty() public {
        confirmBetween(0, 1, USD, 500, ob(1));
        confirmBetween(1, 0, USD, 300, ob(2));
        bytes memory sig = signNet(users[2].ledgerPk, GROUP, USD, users[0].ledger, users[1].ledger, 0);
        vm.expectRevert(abi.encodeWithSelector(DarefulLedger.NotParty.selector, users[2].ledger));
        ledger.net(GROUP, USD, users[0].ledger, users[1].ledger, sig);
    }

    function test_NetRejectsWhenNothingReciprocal() public {
        confirmBetween(0, 1, USD, 500, ob(1));
        bytes memory sig = signNet(users[0].ledgerPk, GROUP, USD, users[0].ledger, users[1].ledger, 0);
        vm.expectRevert(DarefulLedger.NothingToNet.selector);
        ledger.net(GROUP, USD, users[0].ledger, users[1].ledger, sig);
    }

    function test_NetRejectsReplay() public {
        confirmBetween(0, 1, USD, 500, ob(1));
        confirmBetween(1, 0, USD, 300, ob(2));
        bytes memory sig = signNet(users[0].ledgerPk, GROUP, USD, users[0].ledger, users[1].ledger, 0);
        ledger.net(GROUP, USD, users[0].ledger, users[1].ledger, sig);
        confirmBetween(1, 0, USD, 100, ob(3));
        vm.expectRevert();
        ledger.net(GROUP, USD, users[0].ledger, users[1].ledger, sig);
    }

    function test_NetLeavesUniqueObligationsAlone() public {
        bytes memory sig = signConfirm(users[0].ledgerPk, GROUP, BEER, users[1].ledger, 1, ob(1), true);
        ledger.confirm(GROUP, BEER, users[1].ledger, 1, ob(1), true, sig);
        confirmBetween(1, 0, BEER, 1, ob(2));
        bytes memory nsig = signNet(users[0].ledgerPk, GROUP, BEER, users[0].ledger, users[1].ledger, 0);
        vm.expectRevert(DarefulLedger.NothingToNet.selector);
        ledger.net(GROUP, BEER, users[0].ledger, users[1].ledger, nsig);
    }

    // ------------------------------------------------------------------ registration and roles

    function test_RegistrationIsRelayerOnly() public {
        DarefulLedger.Member[] memory ms = new DarefulLedger.Member[](1);
        ms[0] = DarefulLedger.Member(address(0x1), address(0x2));
        vm.expectRevert(DarefulLedger.NotRelayer.selector);
        ledger.createGroup(keccak256("g2"), ms);
        vm.expectRevert(DarefulLedger.NotRelayer.selector);
        ledger.addMember(GROUP, ms[0]);
        vm.expectRevert(DarefulLedger.NotRelayer.selector);
        ledger.createDenom(GROUP, keccak256("d"), true);
    }

    function test_GovernanceOfReturnsEveryMemberInOrder() public view {
        address[] memory q = ledger.governanceOf(GROUP);
        assertEq(q.length, 5);
        for (uint256 i = 0; i < 5; i++) {
            assertEq(q[i], users[i].governance);
        }
    }

    function test_GroupCannotBeCreatedTwice() public {
        DarefulLedger.Member[] memory ms = new DarefulLedger.Member[](1);
        ms[0] = DarefulLedger.Member(address(0x1), address(0x2));
        vm.prank(RELAYER);
        vm.expectRevert(abi.encodeWithSelector(DarefulLedger.GroupExists.selector, GROUP));
        ledger.createGroup(GROUP, ms);
    }

    function test_LedgerWalletIsPairedWithOneGovernanceWalletForLife() public {
        bytes32 g2 = keccak256("group:two");
        DarefulLedger.Member[] memory ms = new DarefulLedger.Member[](1);
        ms[0] = DarefulLedger.Member(users[0].ledger, address(0xDEAD));
        vm.prank(RELAYER);
        vm.expectRevert(
            abi.encodeWithSelector(DarefulLedger.WalletPairMismatch.selector, users[0].ledger, address(0xDEAD))
        );
        ledger.createGroup(g2, ms);

        ms[0] = DarefulLedger.Member(users[0].ledger, users[0].governance);
        vm.prank(RELAYER);
        ledger.createGroup(g2, ms);
        assertEq(ledger.governanceOf(g2)[0], users[0].governance);
    }

    function test_MemberWalletsMustDiffer() public {
        vm.prank(RELAYER);
        vm.expectRevert(DarefulLedger.SameWallets.selector);
        ledger.addMember(GROUP, DarefulLedger.Member(address(0x9), address(0x9)));
    }

    function test_AddMemberAppendsToQuorum() public {
        uint256 lpk = 0xF00D;
        uint256 gpk = 0xCAFE;
        vm.prank(RELAYER);
        ledger.addMember(GROUP, DarefulLedger.Member(vm.addr(lpk), vm.addr(gpk)));
        assertEq(ledger.governanceOf(GROUP).length, 6);
        assertTrue(ledger.isLedgerMember(GROUP, vm.addr(lpk)));
        assertTrue(ledger.isGovernanceMember(GROUP, vm.addr(gpk)));
    }

    function test_MintFromDareIsDaresOnly() public {
        vm.expectRevert(DarefulLedger.NotDares.selector);
        ledger.mintFromDare(GROUP, USD, users[0].ledger, users[1].ledger, 1, ob(1));
        vm.prank(RELAYER);
        vm.expectRevert(DarefulLedger.NotDares.selector);
        ledger.mintFromDare(GROUP, USD, users[0].ledger, users[1].ledger, 1, ob(1));
    }

    function test_SetDaresOnlyOnce() public {
        vm.prank(RELAYER);
        vm.expectRevert(DarefulLedger.DaresAlreadySet.selector);
        ledger.setDares(address(0x1234));
    }
}
