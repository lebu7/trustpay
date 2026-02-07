// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract PaymentProof {
    struct Payment {
        string refId;
        address payer;
        uint256 amount;
        uint256 timestamp;
        string txHash;
    }

    mapping(string => Payment) private payments;
    mapping(string => bool) private exists;

    event PaymentRecorded(
        string refId,
        address payer,
        uint256 amount,
        uint256 timestamp,
        string txHash
    );

    function recordPayment(
        string calldata refId,
        uint256 amount,
        string calldata txHash
    ) external {
        require(bytes(refId).length > 0, "refId required");
        require(amount > 0, "amount required");
        require(!exists[refId], "refId already used");

        payments[refId] = Payment({
            refId: refId,
            payer: msg.sender,
            amount: amount,
            timestamp: block.timestamp,
            txHash: txHash
        });

        exists[refId] = true;

        emit PaymentRecorded(refId, msg.sender, amount, block.timestamp, txHash);
    }

    function getPayment(string calldata refId)
        external
        view
        returns (string memory, address, uint256, uint256, string memory)
    {
        require(exists[refId], "Not found");
        Payment memory p = payments[refId];
        return (p.refId, p.payer, p.amount, p.timestamp, p.txHash);
    }

    function paymentExists(string calldata refId) external view returns (bool) {
        return exists[refId];
    }
}
