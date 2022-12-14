// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

contract VRFeventEmitter {
    // Defined in Operator.sol of Chainlink v0.7
    event OracleRequest(
        bytes32 indexed specId,
        address requester,
        /* bytes32 requestId, */
        uint256 payment
        /* address callbackAddr, */
        /* bytes4 callbackFunctionId */
        // uint256 cancelExpiration,
        // uint256 dataVersion,
        // bytes data
  );

  function buildRequest(
    bytes32 specId,
    address requester,
    uint256 payment
  ) public {
      emit OracleRequest(
        specId,
        requester,
        payment
      );
  }
}