// frontend/utils/constants.js

export const REAL_ESTATE_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
export const ESCROW_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

export const ROLES = {
  inspector: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  lender: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
  government: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
};

export const PROPERTY_TYPES = [
  "Residential",
  "Commercial",
  "Industrial",
  "Agricultural",
  "Mixed Use",
];

export const STATUS_STEPS = [
  { key: "listed", label: "Listed", icon: "📋" },
  { key: "governmentVerified", label: "Gov Verified", icon: "🏛" },
  { key: "inspectionPassed", label: "Inspected", icon: "🔍" },
  { key: "buyerDeposited", label: "Buyer Funded", icon: "💰" },
  { key: "lenderApproved", label: "Lender OK", icon: "🏦" },
  { key: "sellerApproved", label: "Seller OK", icon: "✍️" },
  { key: "sold", label: "Sold", icon: "🎉" },
];

// Network config for future testnet deployment
export const NETWORKS = {
  localhost: {
    chainId: "0x7A69",
    chainName: "Hardhat Localhost",
    rpcUrls: ["http://127.0.0.1:8545"],
  },
  sepolia: {
    chainId: "0xaa36a7",
    chainName: "Sepolia Testnet",
    rpcUrls: ["https://rpc.sepolia.org"],
    blockExplorerUrls: ["https://sepolia.etherscan.io"],
  },
};