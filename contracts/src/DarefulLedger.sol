// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { ERC1155 } from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title DarefulLedger
/// @notice One ERC-1155 for every group. A token id encodes an obligation edge (group, denomination, debtor)
///         and the creditor holds the balance. Nothing minted here can ever move: `_update` reverts every
///         transfer, so a balance can only be created by a debtor's signature (`confirm`, `confirmMany`) or by
///         a resolved market (`mintFromDare`), and can only be destroyed by the creditor's signature (`close`)
///         or by netting reciprocal edges (`net`).
///
///         Invariants this contract enforces, in the order they matter:
///         1. A balance exists only because its debtor signed for it (or a market they signed into resolved).
///         2. A balance never changes hands. Transfers revert unconditionally, approvals or not.
///         3. Both parties to every edge are registered members of the group, each with a ledger wallet and a
///            governance wallet, and a ledger wallet is paired with exactly one governance wallet for life.
///         4. Every mint carries the offchain obligation uuid, so the two ledgers join without ambiguity.
///         5. Membership and denominations are written only by the relayer. Signed mutations may be submitted
///            by anyone, because the signature is the authorization, not the caller.
contract DarefulLedger is ERC1155, EIP712 {
    // ----------------------------------------------------------------------------------------------------
    // Types (PLANNING.md 5a)
    // ----------------------------------------------------------------------------------------------------

    enum CloseReason {
        Settled,
        Forgiven
    }

    struct Member {
        address ledger;
        address governance;
    }

    struct Group {
        bytes32 id;
        Member[] members;
    }

    struct Denom {
        bytes32 id;
        bytes32 groupId;
        bool quantifiable;
    }

    /// @dev Per-obligation accounting. `minted` doubles as the existence flag (an obligation is never minted
    ///      with quantity zero). `closed` never exceeds `minted`; netting reduces balances without touching
    ///      it, so `minted - closed` is an upper bound on what remains, and the ERC-1155 balance is the
    ///      hard bound.
    struct Obligation {
        uint256 tokenId;
        address creditor;
        uint256 minted;
        uint256 closed;
        uint256 closes; // sequence number for Close signatures
    }

    // ----------------------------------------------------------------------------------------------------
    // Events (PLANNING.md 5a)
    // ----------------------------------------------------------------------------------------------------

    event Confirmed(
        bytes32 indexed groupId,
        bytes32 indexed denomId,
        address indexed debtor,
        address creditor,
        uint256 id,
        uint256 qty,
        bytes16 obligationId,
        bool unique
    );
    event Closed(uint256 indexed id, address indexed creditor, uint256 qty, CloseReason reason, bytes16 obligationId);
    event Netted(bytes32 indexed groupId, bytes32 indexed denomId, address a, address b, uint256 qty);
    event GroupCreated(bytes32 indexed groupId, address[] ledgers, address[] governances);
    event MemberAdded(bytes32 indexed groupId, address ledger, address governance);
    event DenomCreated(bytes32 indexed groupId, bytes32 indexed denomId, bool quantifiable);

    // ----------------------------------------------------------------------------------------------------
    // Errors
    // ----------------------------------------------------------------------------------------------------

    error NotRelayer();
    error NotDares();
    error DaresAlreadySet();
    error ZeroAddress();
    error ZeroId();
    error GroupExists(bytes32 groupId);
    error UnknownGroup(bytes32 groupId);
    error AlreadyMember(bytes32 groupId, address wallet);
    error NotMember(bytes32 groupId, address wallet);
    error WalletPairMismatch(address ledger, address governance);
    error SameWallets();
    error DenomExists(bytes32 groupId, bytes32 denomId);
    error UnknownDenom(bytes32 groupId, bytes32 denomId);
    error SelfObligation();
    error ObligationExists(bytes16 obligationId);
    error UnknownObligation(bytes16 obligationId);
    error BadQuantity();
    error UnquantifiableQuantity();
    error TokenMismatch(bytes16 obligationId, uint256 tokenId);
    error NotCreditor(bytes16 obligationId, address signer);
    error ExceedsObligation(bytes16 obligationId, uint256 minted, uint256 closed, uint256 qty);
    error NothingToNet();
    error NotParty(address signer);
    error LengthMismatch();
    error EmptyBatch();

    // ----------------------------------------------------------------------------------------------------
    // Storage
    // ----------------------------------------------------------------------------------------------------

    /// @notice The trusted relayer. Registers groups, members, and denominations, and sets `dares` once.
    address public immutable relayer;

    /// @notice The DarefulDares contract, the only caller of `mintFromDare`. Set once after deployment.
    address public dares;

    mapping(bytes32 groupId => Group) private _groups;
    mapping(bytes32 groupId => mapping(address wallet => bool)) private _isLedgerMember;
    mapping(bytes32 groupId => mapping(address wallet => bool)) private _isGovernanceMember;
    mapping(bytes32 groupId => mapping(bytes32 denomId => Denom)) private _denoms;
    mapping(bytes32 groupId => mapping(bytes32 denomId => bool)) private _denomExists;

    /// @notice Contract-wide pairing of a ledger wallet with its governance wallet, fixed on first
    ///         registration. A ledger wallet can never be re-registered with a different governance wallet.
    mapping(address ledger => address governance) public governanceOfLedger;

    mapping(bytes16 obligationId => Obligation) private _obligations;

    /// @notice Sequence number of nets on a (group, denom, pair) so Net signatures cannot be replayed.
    mapping(bytes32 pairKey => uint256) public netNonces;

    // ----------------------------------------------------------------------------------------------------
    // EIP-712
    // ----------------------------------------------------------------------------------------------------

    bytes32 public constant CONFIRM_TYPEHASH = keccak256(
        "Confirm(bytes32 groupId,bytes32 denomId,address creditor,uint256 qty,bytes16 obligationId,bool unique)"
    );
    bytes32 public constant CONFIRM_MANY_TYPEHASH = keccak256(
        "ConfirmMany(bytes32[] groupIds,bytes32[] denomIds,address[] creditors,uint256[] qtys,bytes16[] obligationIds,bool[] uniques)"
    );
    bytes32 public constant CLOSE_TYPEHASH =
        keccak256("Close(uint256 id,uint256 qty,uint8 reason,bytes16 obligationId,uint256 nonce)");
    bytes32 public constant NET_TYPEHASH =
        keccak256("Net(bytes32 groupId,bytes32 denomId,address a,address b,uint256 nonce)");

    // ----------------------------------------------------------------------------------------------------
    // Constructor and roles
    // ----------------------------------------------------------------------------------------------------

    constructor(address relayer_) ERC1155("") EIP712("DarefulLedger", "1") {
        if (relayer_ == address(0)) revert ZeroAddress();
        relayer = relayer_;
    }

    modifier onlyRelayer() {
        if (msg.sender != relayer) revert NotRelayer();
        _;
    }

    /// @notice Wire the DarefulDares contract. Callable once, by the relayer, at deployment.
    function setDares(address dares_) external onlyRelayer {
        if (dares != address(0)) revert DaresAlreadySet();
        if (dares_ == address(0)) revert ZeroAddress();
        dares = dares_;
    }

    // ----------------------------------------------------------------------------------------------------
    // Registration (relayer only)
    // ----------------------------------------------------------------------------------------------------

    /// @notice Register a group with its initial members. Both wallets per member, registered together.
    function createGroup(bytes32 groupId, Member[] calldata members) external onlyRelayer {
        if (groupId == bytes32(0)) revert ZeroId();
        if (_groups[groupId].id != bytes32(0)) revert GroupExists(groupId);
        if (members.length == 0) revert EmptyBatch();
        _groups[groupId].id = groupId;
        address[] memory ledgers = new address[](members.length);
        address[] memory governances = new address[](members.length);
        for (uint256 i = 0; i < members.length; i++) {
            _addMember(groupId, members[i]);
            ledgers[i] = members[i].ledger;
            governances[i] = members[i].governance;
        }
        emit GroupCreated(groupId, ledgers, governances);
    }

    /// @notice Add one member to an existing group.
    function addMember(bytes32 groupId, Member calldata m) external onlyRelayer {
        if (_groups[groupId].id == bytes32(0)) revert UnknownGroup(groupId);
        _addMember(groupId, m);
        emit MemberAdded(groupId, m.ledger, m.governance);
    }

    /// @notice Register a denomination inside a group. Denomination ids are group-scoped.
    function createDenom(bytes32 groupId, bytes32 denomId, bool quantifiable) external onlyRelayer {
        if (_groups[groupId].id == bytes32(0)) revert UnknownGroup(groupId);
        if (denomId == bytes32(0)) revert ZeroId();
        if (_denomExists[groupId][denomId]) revert DenomExists(groupId, denomId);
        _denoms[groupId][denomId] = Denom({ id: denomId, groupId: groupId, quantifiable: quantifiable });
        _denomExists[groupId][denomId] = true;
        emit DenomCreated(groupId, denomId, quantifiable);
    }

    function _addMember(bytes32 groupId, Member calldata m) private {
        if (m.ledger == address(0) || m.governance == address(0)) revert ZeroAddress();
        if (m.ledger == m.governance) revert SameWallets();
        if (_isLedgerMember[groupId][m.ledger] || _isGovernanceMember[groupId][m.ledger]) {
            revert AlreadyMember(groupId, m.ledger);
        }
        if (_isLedgerMember[groupId][m.governance] || _isGovernanceMember[groupId][m.governance]) {
            revert AlreadyMember(groupId, m.governance);
        }
        address paired = governanceOfLedger[m.ledger];
        if (paired == address(0)) {
            governanceOfLedger[m.ledger] = m.governance;
        } else if (paired != m.governance) {
            revert WalletPairMismatch(m.ledger, m.governance);
        }
        _groups[groupId].members.push(m);
        _isLedgerMember[groupId][m.ledger] = true;
        _isGovernanceMember[groupId][m.governance] = true;
    }

    // ----------------------------------------------------------------------------------------------------
    // Views
    // ----------------------------------------------------------------------------------------------------

    /// @notice The governance wallets of every member of `groupId`. DarefulDares reads its quorum from here.
    function governanceOf(bytes32 groupId) external view returns (address[] memory) {
        Group storage g = _groups[groupId];
        if (g.id == bytes32(0)) revert UnknownGroup(groupId);
        address[] memory out = new address[](g.members.length);
        for (uint256 i = 0; i < g.members.length; i++) {
            out[i] = g.members[i].governance;
        }
        return out;
    }

    function membersOf(bytes32 groupId) external view returns (Member[] memory) {
        Group storage g = _groups[groupId];
        if (g.id == bytes32(0)) revert UnknownGroup(groupId);
        return g.members;
    }

    function groupExists(bytes32 groupId) external view returns (bool) {
        return _groups[groupId].id != bytes32(0);
    }

    function isLedgerMember(bytes32 groupId, address wallet) external view returns (bool) {
        return _isLedgerMember[groupId][wallet];
    }

    function isGovernanceMember(bytes32 groupId, address wallet) external view returns (bool) {
        return _isGovernanceMember[groupId][wallet];
    }

    function denomOf(bytes32 groupId, bytes32 denomId) external view returns (Denom memory) {
        if (!_denomExists[groupId][denomId]) revert UnknownDenom(groupId, denomId);
        return _denoms[groupId][denomId];
    }

    function obligationOf(bytes16 obligationId) external view returns (Obligation memory) {
        Obligation memory ob = _obligations[obligationId];
        if (ob.minted == 0) revert UnknownObligation(obligationId);
        return ob;
    }

    /// @notice Token id of a fungible edge: what `debtor` owes in `denomId` within `groupId`.
    function fungibleId(bytes32 groupId, bytes32 denomId, address debtor) public pure returns (uint256) {
        return uint256(keccak256(abi.encode(groupId, denomId, debtor)));
    }

    /// @notice Token id of a unique (indivisible) obligation.
    function uniqueId(bytes32 groupId, bytes32 denomId, address debtor, bytes16 obligationId)
        public
        pure
        returns (uint256)
    {
        return uint256(keccak256(abi.encode(groupId, denomId, debtor, obligationId)));
    }

    function netNonceOf(bytes32 groupId, bytes32 denomId, address a, address b) public view returns (uint256) {
        return netNonces[_pairKey(groupId, denomId, a, b)];
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ----------------------------------------------------------------------------------------------------
    // Signed mutations (submitted by the relayer, authorized by the signature)
    // ----------------------------------------------------------------------------------------------------

    /// @notice The debtor signs; the obligation mints to the creditor.
    function confirm(
        bytes32 groupId,
        bytes32 denomId,
        address creditor,
        uint256 qty,
        bytes16 obligationId,
        bool unique,
        bytes calldata sig
    ) external {
        bytes32 structHash =
            keccak256(abi.encode(CONFIRM_TYPEHASH, groupId, denomId, creditor, qty, obligationId, unique));
        address debtor = ECDSA.recover(_hashTypedDataV4(structHash), sig);
        uint256 id = _register(groupId, denomId, debtor, creditor, qty, obligationId, unique);
        _mint(creditor, id, qty, abi.encodePacked(obligationId));
    }

    /// @notice The debtor signs once over the whole batch; every obligation mints, grouped by creditor
    ///         through `_mintBatch`. All or nothing.
    function confirmMany(
        bytes32[] calldata groupIds,
        bytes32[] calldata denomIds,
        address[] calldata creditors,
        uint256[] calldata qtys,
        bytes16[] calldata obligationIds,
        bool[] calldata uniques,
        bytes calldata sig
    ) external {
        uint256 n = groupIds.length;
        if (n == 0) revert EmptyBatch();
        if (
            denomIds.length != n || creditors.length != n || qtys.length != n || obligationIds.length != n
                || uniques.length != n
        ) revert LengthMismatch();

        address debtor = ECDSA.recover(
            _hashTypedDataV4(_hashConfirmMany(groupIds, denomIds, creditors, qtys, obligationIds, uniques)), sig
        );

        uint256[] memory ids = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            ids[i] = _register(groupIds[i], denomIds[i], debtor, creditors[i], qtys[i], obligationIds[i], uniques[i]);
        }
        _mintGroupedByCreditor(creditors, ids, qtys, obligationIds);
    }

    function _hashConfirmMany(
        bytes32[] calldata groupIds,
        bytes32[] calldata denomIds,
        address[] calldata creditors,
        uint256[] calldata qtys,
        bytes16[] calldata obligationIds,
        bool[] calldata uniques
    ) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                CONFIRM_MANY_TYPEHASH,
                keccak256(abi.encodePacked(groupIds)),
                keccak256(abi.encodePacked(denomIds)),
                keccak256(abi.encodePacked(creditors)),
                keccak256(abi.encodePacked(qtys)),
                keccak256(abi.encodePacked(obligationIds)),
                keccak256(abi.encodePacked(uniques))
            )
        );
    }

    /// @dev One `_mintBatch` per distinct creditor, each carrying its obligation ids in `data`. A creditor's
    ///      batch is emitted at the first index where that creditor appears.
    function _mintGroupedByCreditor(
        address[] calldata creditors,
        uint256[] memory ids,
        uint256[] calldata qtys,
        bytes16[] calldata obligationIds
    ) private {
        for (uint256 i = 0; i < creditors.length; i++) {
            if (_firstIndexOf(creditors, creditors[i]) != i) continue;
            _mintBatchFor(i, creditors, ids, qtys, obligationIds);
        }
    }

    function _firstIndexOf(address[] calldata creditors, address who) private pure returns (uint256) {
        for (uint256 j = 0; j < creditors.length; j++) {
            if (creditors[j] == who) return j;
        }
        return type(uint256).max;
    }

    function _mintBatchFor(
        uint256 first,
        address[] calldata creditors,
        uint256[] memory ids,
        uint256[] calldata qtys,
        bytes16[] calldata obligationIds
    ) private {
        address creditor = creditors[first];
        uint256 count = 0;
        for (uint256 j = first; j < creditors.length; j++) {
            if (creditors[j] == creditor) count++;
        }
        uint256[] memory batchIds = new uint256[](count);
        uint256[] memory batchQtys = new uint256[](count);
        bytes16[] memory batchObligations = new bytes16[](count);
        uint256 k = 0;
        for (uint256 j = first; j < creditors.length; j++) {
            if (creditors[j] != creditor) continue;
            batchIds[k] = ids[j];
            batchQtys[k] = qtys[j];
            batchObligations[k] = obligationIds[j];
            k++;
        }
        _mintBatch(creditor, batchIds, batchQtys, abi.encode(batchObligations));
    }

    /// @notice The creditor signs; `qty` units of the obligation burn, with the reason recorded.
    function close(uint256 id, uint256 qty, CloseReason reason, bytes16 obligationId, bytes calldata sig)
        external
    {
        Obligation storage ob = _obligations[obligationId];
        if (ob.minted == 0) revert UnknownObligation(obligationId);
        if (ob.tokenId != id) revert TokenMismatch(obligationId, id);
        if (qty == 0) revert BadQuantity();

        bytes32 structHash = keccak256(abi.encode(CLOSE_TYPEHASH, id, qty, uint8(reason), obligationId, ob.closes));
        address signer = ECDSA.recover(_hashTypedDataV4(structHash), sig);
        if (signer != ob.creditor) revert NotCreditor(obligationId, signer);

        if (ob.closed + qty > ob.minted) revert ExceedsObligation(obligationId, ob.minted, ob.closed, qty);
        ob.closed += qty;
        ob.closes += 1;

        _burn(signer, id, qty);
        emit Closed(id, signer, qty, reason, obligationId);
    }

    /// @notice Either party signs; the reciprocal fungible edges between `a` and `b` burn by the smaller
    ///         of the two balances. Unique obligations have their own ids and are never netted.
    function net(bytes32 groupId, bytes32 denomId, address a, address b, bytes calldata sig) external {
        if (a == b) revert SelfObligation();
        _requireMembers(groupId, a, b);
        if (!_denomExists[groupId][denomId]) revert UnknownDenom(groupId, denomId);

        bytes32 key = _pairKey(groupId, denomId, a, b);
        bytes32 structHash = keccak256(abi.encode(NET_TYPEHASH, groupId, denomId, a, b, netNonces[key]));
        address signer = ECDSA.recover(_hashTypedDataV4(structHash), sig);
        if (signer != a && signer != b) revert NotParty(signer);
        netNonces[key] += 1;

        uint256 idA = fungibleId(groupId, denomId, a); // a owes b; b holds it
        uint256 idB = fungibleId(groupId, denomId, b); // b owes a; a holds it
        uint256 owedByA = balanceOf(b, idA);
        uint256 owedByB = balanceOf(a, idB);
        uint256 qty = owedByA < owedByB ? owedByA : owedByB;
        if (qty == 0) revert NothingToNet();

        _burn(b, idA, qty);
        _burn(a, idB, qty);
        emit Netted(groupId, denomId, a, b, qty);
    }

    /// @notice A resolved market mints one edge per nonzero pairwise transfer. Only DarefulDares may call.
    function mintFromDare(
        bytes32 groupId,
        bytes32 denomId,
        address debtor,
        address creditor,
        uint256 qty,
        bytes16 obligationId
    ) external {
        if (msg.sender != dares) revert NotDares();
        uint256 id = _register(groupId, denomId, debtor, creditor, qty, obligationId, false);
        _mint(creditor, id, qty, abi.encodePacked(obligationId));
    }

    // ----------------------------------------------------------------------------------------------------
    // Internals
    // ----------------------------------------------------------------------------------------------------

    /// @dev Every check a mint must pass, then the per-obligation record. Returns the token id.
    function _register(
        bytes32 groupId,
        bytes32 denomId,
        address debtor,
        address creditor,
        uint256 qty,
        bytes16 obligationId,
        bool unique
    ) private returns (uint256 id) {
        if (debtor == creditor) revert SelfObligation();
        _requireMembers(groupId, debtor, creditor);
        if (!_denomExists[groupId][denomId]) revert UnknownDenom(groupId, denomId);
        if (obligationId == bytes16(0)) revert ZeroId();
        if (_obligations[obligationId].minted != 0) revert ObligationExists(obligationId);

        Denom storage d = _denoms[groupId][denomId];
        if (!d.quantifiable || unique) {
            // An unquantifiable denomination mints exactly one unit per obligation, and a unique
            // obligation is indivisible by definition.
            if (qty != 1) revert UnquantifiableQuantity();
        } else if (qty == 0) {
            revert BadQuantity();
        }

        id = unique ? uniqueId(groupId, denomId, debtor, obligationId) : fungibleId(groupId, denomId, debtor);
        _obligations[obligationId] =
            Obligation({ tokenId: id, creditor: creditor, minted: qty, closed: 0, closes: 0 });
        emit Confirmed(groupId, denomId, debtor, creditor, id, qty, obligationId, unique);
    }

    function _requireMembers(bytes32 groupId, address x, address y) private view {
        if (_groups[groupId].id == bytes32(0)) revert UnknownGroup(groupId);
        if (!_isLedgerMember[groupId][x]) revert NotMember(groupId, x);
        if (!_isLedgerMember[groupId][y]) revert NotMember(groupId, y);
    }

    function _pairKey(bytes32 groupId, bytes32 denomId, address a, address b) private pure returns (bytes32) {
        (address lo, address hi) = a < b ? (a, b) : (b, a);
        return keccak256(abi.encode(groupId, denomId, lo, hi));
    }

    /// @dev Transfers revert unconditionally. Only mints (from == 0) and burns (to == 0) pass.
    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal
        override
    {
        require(from == address(0) || to == address(0), "non-transferable");
        super._update(from, to, ids, values);
    }
}
