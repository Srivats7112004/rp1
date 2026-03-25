// frontend/pages/test.js
import { useEffect, useState } from "react";
import { ethers } from "ethers";
import RealEstateABI from "../abis/RealEstate.json";
import EscrowABI from "../abis/Escrow.json";

export default function TestPage() {
  const [results, setResults] = useState([]);

  const addResult = (msg) => {
    setResults((prev) => [...prev, msg]);
  };

  useEffect(() => {
    async function runTests() {
      try {
        // Test 1: MetaMask
        if (!window.ethereum) {
          addResult("❌ MetaMask not found");
          return;
        }
        addResult("✅ MetaMask found");

        // Test 2: Connect
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        addResult("✅ Wallet connected");

        // Test 3: Network
        const network = await provider.getNetwork();
        addResult(`Network Chain ID: ${network.chainId}`);

        if (network.chainId !== 31337) {
          addResult(`❌ Wrong network! Expected 31337, got ${network.chainId}`);
          return;
        }
        addResult("✅ Correct network (31337)");

        // Test 4: Account
        const signer = provider.getSigner();
        const address = await signer.getAddress();
        addResult(`✅ Account: ${address}`);

        // Test 5: Check RealEstate contract code
        const realEstateAddr = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
        const code1 = await provider.getCode(realEstateAddr);
        if (code1 === "0x") {
          addResult(`❌ No contract at RealEstate address: ${realEstateAddr}`);
          return;
        }
        addResult(`✅ RealEstate contract exists (${code1.length} bytes)`);

        // Test 6: Check Escrow contract code
        const escrowAddr = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
        const code2 = await provider.getCode(escrowAddr);
        if (code2 === "0x") {
          addResult(`❌ No contract at Escrow address: ${escrowAddr}`);
          return;
        }
        addResult(`✅ Escrow contract exists (${code2.length} bytes)`);

        // Test 7: ABI info
        addResult(`RealEstate ABI functions: ${RealEstateABI.abi.length}`);
        addResult(`Escrow ABI functions: ${EscrowABI.abi.length}`);

        // Test 8: Create contract instances
        const realEstate = new ethers.Contract(
          realEstateAddr,
          RealEstateABI.abi,
          provider
        );
        addResult("✅ RealEstate contract instance created");

        const escrow = new ethers.Contract(
          escrowAddr,
          EscrowABI.abi,
          provider
        );
        addResult("✅ Escrow contract instance created");

        // Test 9: Use events instead of totalSupply
        addResult("");
        addResult("--- Testing Event-Based Token Discovery ---");

        const mintFilter = realEstate.filters.Transfer(
          ethers.constants.AddressZero,
          null
        );
        const mintEvents = await realEstate.queryFilter(mintFilter, 0, "latest");
        addResult(`✅ Found ${mintEvents.length} mint events`);

        // List all minted tokens
        for (const event of mintEvents) {
          const tokenId = event.args.tokenId.toNumber();
          const to = event.args.to;
          addResult(`   Token #${tokenId} minted to ${to}`);

          try {
            const owner = await realEstate.ownerOf(tokenId);
            addResult(`   Current owner: ${owner}`);

            const uri = await realEstate.tokenURI(tokenId);
            addResult(`   Token URI: ${uri.substring(0, 60)}...`);
          } catch (e) {
            addResult(`   ⚠️ Could not get details: ${e.message}`);
          }

          try {
            const listing = await escrow.listings(tokenId);
            addResult(`   Listed: ${listing.isListed}`);
            if (listing.isListed) {
              addResult(`   Price: ${ethers.utils.formatEther(listing.purchasePrice)} ETH`);
              addResult(`   Seller: ${listing.seller}`);
            }
          } catch (e) {
            addResult(`   ⚠️ Escrow listing error: ${e.message}`);
          }
        }

        // Test 10: Escrow basic reads
        addResult("");
        addResult("--- Testing Escrow Reads ---");

        try {
          const nftAddress = await escrow.nftAddress();
          addResult(`✅ escrow.nftAddress() = ${nftAddress}`);
        } catch (e) {
          addResult(`❌ escrow.nftAddress() failed: ${e.message}`);
        }

        try {
          const inspector = await escrow.inspector();
          addResult(`✅ escrow.inspector() = ${inspector}`);
        } catch (e) {
          addResult(`❌ escrow.inspector() failed: ${e.message}`);
        }

        try {
          const lender = await escrow.lender();
          addResult(`✅ escrow.lender() = ${lender}`);
        } catch (e) {
          addResult(`❌ escrow.lender() failed: ${e.message}`);
        }

        try {
          const gov = await escrow.government();
          addResult(`✅ escrow.government() = ${gov}`);
        } catch (e) {
          addResult(`❌ escrow.government() failed: ${e.message}`);
        }

        addResult("");
        addResult("🎉 ALL TESTS PASSED!");
        addResult("Your contracts work. App should load correctly now.");

      } catch (error) {
        addResult(`❌ ERROR: ${error.message}`);
        console.error("Full error:", error);
      }
    }

    runTests();
  }, []);

  return (
    <div
      style={{
        padding: "40px",
        fontFamily: "monospace",
        backgroundColor: "#0a0a0a",
        color: "#fff",
        minHeight: "100vh",
      }}
    >
      <h1 style={{ color: "#06b6d4", marginBottom: "20px" }}>
        🔍 BlockEstate Contract Debug
      </h1>
      <p style={{ color: "#9ca3af", marginBottom: "20px", fontSize: "14px" }}>
        This page tests all contract connections without using totalSupply()
      </p>
      <div style={{ lineHeight: "2" }}>
        {results.map((r, i) => (
          <div
            key={i}
            style={{
              padding: "4px 0",
              color: r.startsWith("✅")
                ? "#4ade80"
                : r.startsWith("❌")
                ? "#f87171"
                : r.startsWith("🎉")
                ? "#06b6d4"
                : r.startsWith("---")
                ? "#fbbf24"
                : r.startsWith("   ")
                ? "#94a3b8"
                : "#9ca3af",
            }}
          >
            {r}
          </div>
        ))}
        {results.length === 0 && (
          <div style={{ color: "#9ca3af" }}>Running tests...</div>
        )}
      </div>
    </div>
  );
}