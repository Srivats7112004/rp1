// frontend/pages/debug-mint.js
import { useState } from "react";
import { ethers } from "ethers";
import { useWeb3 } from "../context/Web3Context";
import { REAL_ESTATE_ADDRESS } from "../utils/constants";
import RealEstateABI from "../abis/RealEstate.json";

export default function DebugMint() {
  const { provider } = useWeb3();
  const [results, setResults] = useState([]);

  const addResult = (msg) => {
    setResults((prev) => [...prev, msg]);
    console.log(msg);
  };

  const debugMint = async () => {
    setResults([]);

    try {
      const signer = provider.getSigner();
      const address = await signer.getAddress();
      addResult(`Signer: ${address}`);

      const realEstate = new ethers.Contract(
        REAL_ESTATE_ADDRESS,
        RealEstateABI.abi,
        signer
      );

      addResult("Minting test NFT...");
      const tx = await realEstate.mint("https://test.com/test-image.jpg");
      addResult(`TX Hash: ${tx.hash}`);

      const receipt = await tx.wait();
      addResult(`TX Status: ${receipt.status}`);
      addResult(`Block: ${receipt.blockNumber}`);

      // Log EVERYTHING in receipt
      addResult("");
      addResult("=== RECEIPT LOGS ===");
      addResult(`Number of logs: ${receipt.logs.length}`);

      for (let i = 0; i < receipt.logs.length; i++) {
        const log = receipt.logs[i];
        addResult(`--- Log ${i} ---`);
        addResult(`  Address: ${log.address}`);
        addResult(`  Topics: ${JSON.stringify(log.topics)}`);
        addResult(`  Data: ${log.data}`);

        // Try to parse
        try {
          const parsed = realEstate.interface.parseLog(log);
          addResult(`  Parsed Event: ${parsed.name}`);
          addResult(`  Parsed Args: ${JSON.stringify(parsed.args, null, 2)}`);

          if (parsed.name === "Transfer") {
            addResult(`  FROM: ${parsed.args.from || parsed.args[0]}`);
            addResult(`  TO: ${parsed.args.to || parsed.args[1]}`);
            addResult(`  TOKEN ID: ${parsed.args.tokenId?.toString() || parsed.args[2]?.toString()}`);
          }
        } catch (e) {
          addResult(`  Could not parse: ${e.message}`);
        }
      }

      // Check receipt.events
      addResult("");
      addResult("=== RECEIPT EVENTS ===");
      if (receipt.events) {
        addResult(`Number of events: ${receipt.events.length}`);
        for (let i = 0; i < receipt.events.length; i++) {
          const event = receipt.events[i];
          addResult(`--- Event ${i} ---`);
          addResult(`  Name: ${event.event}`);
          addResult(`  Args: ${JSON.stringify(event.args)}`);
        }
      } else {
        addResult("No events array in receipt");
      }

      // Check Transfer topic manually
      addResult("");
      addResult("=== MANUAL TOPIC CHECK ===");
      const transferTopic = ethers.utils.id("Transfer(address,address,uint256)");
      addResult(`Transfer topic hash: ${transferTopic}`);

      for (const log of receipt.logs) {
        if (log.topics && log.topics[0] === transferTopic) {
          addResult("FOUND Transfer log!");
          if (log.topics.length >= 4) {
            const tokenId = ethers.BigNumber.from(log.topics[3]).toString();
            addResult(`Token ID from topics: ${tokenId}`);
          }
        }
      }

      // Try querying events after mint
      addResult("");
      addResult("=== EVENT QUERY ===");
      const mintFilter = realEstate.filters.Transfer(
        ethers.constants.AddressZero,
        null
      );
      const mintEvents = await realEstate.queryFilter(
        mintFilter,
        receipt.blockNumber,
        receipt.blockNumber
      );
      addResult(`Mint events in block ${receipt.blockNumber}: ${mintEvents.length}`);

      for (const event of mintEvents) {
        addResult(`  Token ID: ${event.args.tokenId.toString()}`);
        addResult(`  To: ${event.args.to}`);
      }

      // Final: Get all mint events ever
      addResult("");
      addResult("=== ALL MINT EVENTS ===");
      const allMints = await realEstate.queryFilter(mintFilter, 0, "latest");
      addResult(`Total mints ever: ${allMints.length}`);
      for (const event of allMints) {
        addResult(`  Token #${event.args.tokenId.toString()} -> ${event.args.to}`);
      }

    } catch (error) {
      addResult(`❌ ERROR: ${error.message}`);
      console.error("Full error:", error);
    }
  };

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
        🔬 Debug Mint Transaction
      </h1>

      <button
        onClick={debugMint}
        style={{
          padding: "12px 24px",
          backgroundColor: "#06b6d4",
          color: "white",
          border: "none",
          borderRadius: "8px",
          fontSize: "16px",
          cursor: "pointer",
          marginBottom: "20px",
        }}
      >
        Mint Test NFT & Debug Receipt
      </button>

      <p style={{ color: "#9ca3af", marginBottom: "20px", fontSize: "12px" }}>
        This will mint an NFT and show the full transaction receipt
      </p>

      <div style={{ lineHeight: "1.8" }}>
        {results.map((r, i) => (
          <div
            key={i}
            style={{
              padding: "2px 0",
              color: r.startsWith("✅") || r.startsWith("FOUND")
                ? "#4ade80"
                : r.startsWith("❌")
                ? "#f87171"
                : r.startsWith("===")
                ? "#fbbf24"
                : r.startsWith("---")
                ? "#818cf8"
                : r.startsWith("  ")
                ? "#94a3b8"
                : "#d1d5db",
            }}
          >
            {r}
          </div>
        ))}
      </div>
    </div>
  );
}