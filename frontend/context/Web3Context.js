// frontend/context/Web3Context.js
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import RealEstateABI from "../abis/RealEstate.json";
import EscrowABI from "../abis/Escrow.json";
import { REAL_ESTATE_ADDRESS, ESCROW_ADDRESS, ROLES } from "../utils/constants";
import { isZeroAddress, parseTokenMetadata } from "../utils/helpers";

const Web3Context = createContext();

export const useWeb3 = () => {
  const context = useContext(Web3Context);
  if (!context) {
    throw new Error("useWeb3 must be used within a Web3Provider");
  }
  return context;
};

export const Web3Provider = ({ children }) => {
  const [account, setAccount] = useState(null);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [realEstate, setRealEstate] = useState(null);
  const [escrow, setEscrow] = useState(null);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState("user");
  const [kycStatus, setKycStatus] = useState({});

  const determineRole = useCallback((address) => {
    if (!address) return "user";
    const addr = address.toLowerCase();
    if (addr === ROLES.inspector.toLowerCase()) return "inspector";
    if (addr === ROLES.lender.toLowerCase()) return "lender";
    if (addr === ROLES.government.toLowerCase()) return "government";
    return "user";
  }, []);

  const connectWallet = async () => {
    try {
      if (!window.ethereum) {
        alert("Please install MetaMask!");
        return;
      }

      const web3Provider = new ethers.providers.Web3Provider(window.ethereum);
      const accounts = await web3Provider.send("eth_requestAccounts", []);

      if (accounts.length > 0) {
        const address = ethers.utils.getAddress(accounts[0]);
        setAccount(address);
        setUserRole(determineRole(address));
        setProvider(web3Provider);
        setSigner(web3Provider.getSigner());
      }
    } catch (error) {
      console.error("Wallet connect failed:", error);
    }
  };

  const loadBlockchainData = useCallback(async () => {
    try {
      if (typeof window === "undefined" || !window.ethereum) return;

      setLoading(true);

      const web3Provider = new ethers.providers.Web3Provider(window.ethereum);
      setProvider(web3Provider);

      const accounts = await web3Provider.send("eth_requestAccounts", []);
      if (accounts.length > 0) {
        const address = ethers.utils.getAddress(accounts[0]);
        setAccount(address);
        setUserRole(determineRole(address));
        setSigner(web3Provider.getSigner());
      }

      const realEstateContract = new ethers.Contract(
        REAL_ESTATE_ADDRESS,
        RealEstateABI.abi,
        web3Provider
      );
      setRealEstate(realEstateContract);

      const escrowContract = new ethers.Contract(
        ESCROW_ADDRESS,
        EscrowABI.abi,
        web3Provider
      );
      setEscrow(escrowContract);

      // Discover minted tokens using direct RPC eth_getLogs
      const transferTopic = ethers.utils.id("Transfer(address,address,uint256)");
      const zeroAddressPadded = ethers.utils.hexZeroPad(
        ethers.constants.AddressZero,
        32
      );

      let tokenIds = [];

      try {
        // Method 1: Direct RPC call for logs
        const logs = await web3Provider.send("eth_getLogs", [
          {
            address: REAL_ESTATE_ADDRESS,
            topics: [transferTopic, zeroAddressPadded],
            fromBlock: "0x0",
            toBlock: "latest",
          },
        ]);

        tokenIds = [
          ...new Set(
            logs
              .map((log) => {
                if (log.topics && log.topics.length >= 4) {
                  return parseInt(log.topics[3], 16);
                }
                return null;
              })
              .filter((id) => id !== null && id > 0)
          ),
        ].sort((a, b) => a - b);

        console.log("Token IDs from eth_getLogs:", tokenIds);
      } catch (e) {
        console.log("eth_getLogs failed:", e.message);

        // Method 2: Scan ownerOf from 1 upwards
        console.log("Falling back to ownerOf scan...");
        for (let i = 1; i <= 100; i++) {
          try {
            await realEstateContract.ownerOf(i);
            tokenIds.push(i);
          } catch (err) {
            break;
          }
        }
        console.log("Token IDs from ownerOf scan:", tokenIds);
      }

      // Load property details for each token
      const loadedProperties = [];

      for (const tokenId of tokenIds) {
        try {
          const listing = await escrowContract.listings(tokenId);
          const owner = await realEstateContract.ownerOf(tokenId);

          if (listing.isListed) {
            const uri = await realEstateContract.tokenURI(tokenId);
            const metadata = await parseTokenMetadata(uri);
            const buyerDeposited = !isZeroAddress(listing.buyer);

            loadedProperties.push({
              id: tokenId,
              uri,
              image: metadata.image || uri,
              name: metadata.name || `Property #${tokenId}`,
              description: metadata.description || "",
              location: metadata.location || "",
              propertyType: metadata.propertyType || "",
              area: metadata.area || "",
              documents: metadata.documents || "",
              attributes: metadata.attributes || {},
              price: ethers.utils.formatEther(listing.purchasePrice),
              purchasePrice: listing.purchasePrice,
              escrowAmount: listing.escrowAmount,
              seller: listing.seller,
              buyer: listing.buyer,
              currentOwner: owner,
              inspectionPassed: listing.inspectionPassed,
              lenderApproved: listing.lenderApproved,
              governmentVerified: listing.governmentVerified,
              sellerApproved: listing.sellerApproved,
              buyerDeposited,
              sold: !listing.isListed && buyerDeposited,
            });
          }
        } catch (err) {
          console.log(`Skipping token ${tokenId}:`, err.message);
        }
      }

      setProperties(loadedProperties);
    } catch (error) {
      console.error("Load blockchain data error:", error);
    } finally {
      setLoading(false);
    }
  }, [determineRole]);

  const requestKYC = (address) => {
    setKycStatus((prev) => ({
      ...prev,
      [address.toLowerCase()]: "pending",
    }));
  };

  const approveKYC = (address) => {
    setKycStatus((prev) => ({
      ...prev,
      [address.toLowerCase()]: "verified",
    }));
  };

  const rejectKYC = (address) => {
    setKycStatus((prev) => ({
      ...prev,
      [address.toLowerCase()]: "rejected",
    }));
  };

  const getKYCStatus = (address) => {
    if (!address) return "none";
    return kycStatus[address.toLowerCase()] || "none";
  };

  const isKYCVerified = (address) => {
    return getKYCStatus(address) === "verified";
  };

  useEffect(() => {
    if (typeof window !== "undefined" && window.ethereum) {
      loadBlockchainData();

      const handleAccountsChanged = (accounts) => {
        if (accounts.length > 0) {
          const address = ethers.utils.getAddress(accounts[0]);
          setAccount(address);
          setUserRole(determineRole(address));
          loadBlockchainData();
        } else {
          setAccount(null);
          setUserRole("user");
        }
      };

      window.ethereum.on("accountsChanged", handleAccountsChanged);

      return () => {
        if (window.ethereum.removeListener) {
          window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
        }
      };
    } else {
      setLoading(false);
    }
  }, [loadBlockchainData, determineRole]);

  const value = {
    account,
    provider,
    signer,
    realEstate,
    escrow,
    properties,
    loading,
    userRole,
    connectWallet,
    loadBlockchainData,
    requestKYC,
    approveKYC,
    rejectKYC,
    getKYCStatus,
    isKYCVerified,
    kycStatus,
  };

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
};