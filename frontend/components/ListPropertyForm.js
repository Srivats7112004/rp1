// frontend/components/ListPropertyForm.js
import { useState } from "react";
import { ethers } from "ethers";
import { useWeb3 } from "../context/Web3Context";
import { createPropertyMetadata, uploadFileToIPFS } from "../utils/pinata";
import { ESCROW_ADDRESS, REAL_ESTATE_ADDRESS, PROPERTY_TYPES } from "../utils/constants";
import KYCBadge from "./KYCBadge";
import RealEstateABI from "../abis/RealEstate.json";

export default function ListPropertyForm({ onSuccess }) {
  const { account, provider, realEstate, escrow } = useWeb3();

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    location: "",
    propertyType: "Residential",
    area: "",
    bedrooms: "",
    bathrooms: "",
    yearBuilt: "",
    price: "",
  });

  const [imageFile, setImageFile] = useState(null);
  const [documentFile, setDocumentFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState("");
  const [useSimpleMode, setUseSimpleMode] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  // Get token ID using direct JSON-RPC call to Hardhat node
  const getTokenIdFromMint = async (receipt) => {
    try {
      // Method 1: Direct JSON-RPC call to get transaction receipt with logs
      const rawReceipt = await provider.send("eth_getTransactionReceipt", [
        receipt.transactionHash,
      ]);

      if (rawReceipt && rawReceipt.logs && rawReceipt.logs.length > 0) {
        const transferTopic = ethers.utils.id(
          "Transfer(address,address,uint256)"
        );

        for (const log of rawReceipt.logs) {
          if (
            log.topics &&
            log.topics[0] === transferTopic &&
            log.topics.length >= 4
          ) {
            const tokenId = parseInt(log.topics[3], 16);
            if (!isNaN(tokenId) && tokenId > 0) {
              console.log("Token ID from raw receipt:", tokenId);
              return tokenId;
            }
          }
        }
      }
    } catch (e) {
      console.log("Method 1 failed:", e.message);
    }

    try {
      // Method 2: Query Transfer events in the block
      const realEstateContract = new ethers.Contract(
        REAL_ESTATE_ADDRESS,
        RealEstateABI.abi,
        provider
      );

      const filter = realEstateContract.filters.Transfer(
        ethers.constants.AddressZero,
        null
      );

      const events = await realEstateContract.queryFilter(
        filter,
        receipt.blockNumber,
        receipt.blockNumber
      );

      if (events.length > 0) {
        const tokenId = events[events.length - 1].args.tokenId.toNumber();
        console.log("Token ID from block events:", tokenId);
        return tokenId;
      }
    } catch (e) {
      console.log("Method 2 failed:", e.message);
    }

    try {
      // Method 3: Get ALL mint events ever and take the last one
      const realEstateContract = new ethers.Contract(
        REAL_ESTATE_ADDRESS,
        RealEstateABI.abi,
        provider
      );

      const filter = realEstateContract.filters.Transfer(
        ethers.constants.AddressZero,
        null
      );

      const allEvents = await realEstateContract.queryFilter(filter, 0, "latest");

      if (allEvents.length > 0) {
        const tokenId = allEvents[allEvents.length - 1].args.tokenId.toNumber();
        console.log("Token ID from all events:", tokenId);
        return tokenId;
      }
    } catch (e) {
      console.log("Method 3 failed:", e.message);
    }

    try {
      // Method 4: Use balanceOf and work backwards
      const signer = provider.getSigner();
      const signerAddress = await signer.getAddress();

      const realEstateContract = new ethers.Contract(
        REAL_ESTATE_ADDRESS,
        RealEstateABI.abi,
        provider
      );

      const balance = await realEstateContract.balanceOf(signerAddress);
      const balanceNum = balance.toNumber();

      // Try token IDs starting from highest likely
      for (let i = balanceNum + 5; i >= 1; i--) {
        try {
          const owner = await realEstateContract.ownerOf(i);
          if (owner.toLowerCase() === signerAddress.toLowerCase()) {
            // Verify this token was just minted (in the same block)
            console.log("Token ID from ownerOf scan:", i);
            return i;
          }
        } catch (e) {
          // Token doesn't exist, skip
        }
      }
    } catch (e) {
      console.log("Method 4 failed:", e.message);
    }

    try {
      // Method 5: Direct eth_getLogs RPC call
      const transferTopic = ethers.utils.id(
        "Transfer(address,address,uint256)"
      );

      const logs = await provider.send("eth_getLogs", [
        {
          address: REAL_ESTATE_ADDRESS,
          topics: [
            transferTopic,
            ethers.utils.hexZeroPad(ethers.constants.AddressZero, 32),
          ],
          fromBlock: ethers.utils.hexValue(receipt.blockNumber),
          toBlock: ethers.utils.hexValue(receipt.blockNumber),
        },
      ]);

      if (logs && logs.length > 0) {
        const lastLog = logs[logs.length - 1];
        if (lastLog.topics && lastLog.topics.length >= 4) {
          const tokenId = parseInt(lastLog.topics[3], 16);
          console.log("Token ID from eth_getLogs:", tokenId);
          return tokenId;
        }
      }
    } catch (e) {
      console.log("Method 5 failed:", e.message);
    }

    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!imageFile || !formData.price) {
      alert("Please provide an image and price.");
      return;
    }

    setIsUploading(true);

    try {
      const signer = provider.getSigner();
      const signerAddress = await signer.getAddress();

      let tokenURI;

      if (useSimpleMode) {
        setUploadStep("Uploading image to IPFS...");
        tokenURI = await uploadFileToIPFS(imageFile);
      } else {
        setUploadStep("Uploading image & metadata to IPFS...");
        const result = await createPropertyMetadata({
          name: formData.name,
          description: formData.description,
          imageFile,
          location: formData.location,
          propertyType: formData.propertyType,
          area: formData.area,
          bedrooms: formData.bedrooms,
          bathrooms: formData.bathrooms,
          yearBuilt: formData.yearBuilt,
          documentFile,
        });
        tokenURI = result.metadataUrl;
      }

      if (!tokenURI) throw new Error("IPFS upload failed");

      // Mint NFT
      setUploadStep("Minting NFT on blockchain...");
      const mintTx = await realEstate.connect(signer).mint(tokenURI);
      const mintReceipt = await mintTx.wait();

      // Get token ID using robust methods
      setUploadStep("Detecting token ID...");
      const tokenId = await getTokenIdFromMint(mintReceipt);

      if (!tokenId) {
        throw new Error(
          "Could not determine minted token ID. Please check the Hardhat node console for the transaction."
        );
      }

      console.log("Successfully detected token ID:", tokenId);

      // Verify ownership
      const ownerOfToken = await realEstate.ownerOf(tokenId);
      if (signerAddress.toLowerCase() !== ownerOfToken.toLowerCase()) {
        throw new Error("Ownership verification failed after minting");
      }

      // Approve escrow
      setUploadStep("Approving escrow contract...");
      const approveTx = await realEstate
        .connect(signer)
        .approve(ESCROW_ADDRESS, tokenId);
      await approveTx.wait();

      // List property
      setUploadStep("Listing property on marketplace...");
      const ethPrice = ethers.utils.parseEther(formData.price);
      const listTx = await escrow
        .connect(signer)
        .list(tokenId, ethPrice, ethPrice);
      await listTx.wait();

      setUploadStep("");
      alert(`Property #${tokenId} listed successfully!`);

      // Reset form
      setFormData({
        name: "",
        description: "",
        location: "",
        propertyType: "Residential",
        area: "",
        bedrooms: "",
        bathrooms: "",
        yearBuilt: "",
        price: "",
      });
      setImageFile(null);
      setDocumentFile(null);
      setImagePreview(null);

      if (onSuccess) onSuccess();
    } catch (error) {
      console.error("Listing failed:", error);
      alert(error?.reason || error?.message || "Property listing failed.");
    }

    setIsUploading(false);
    setUploadStep("");
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg p-8 border border-purple-100">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-2xl font-bold text-purple-700">
          📝 List New Property
        </h3>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-sm text-slate-500">
            {useSimpleMode ? "Simple" : "Advanced"}
          </span>
          <div
            className={`relative w-12 h-6 rounded-full transition cursor-pointer ${
              useSimpleMode ? "bg-slate-300" : "bg-purple-500"
            }`}
            onClick={() => setUseSimpleMode(!useSimpleMode)}
          >
            <div
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                useSimpleMode ? "left-0.5" : "left-6"
              }`}
            />
          </div>
        </label>
      </div>

      <div className="mb-4">
        <KYCBadge address={account} showRequestButton={true} />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Image Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Property Image *
          </label>
          <div className="flex items-start gap-4">
            <input
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="flex-1 p-2 border rounded-lg text-sm"
              required
            />
            {imagePreview && (
              <img
                src={imagePreview}
                alt="Preview"
                className="w-20 h-20 object-cover rounded-lg border"
              />
            )}
          </div>
        </div>

        {/* Advanced Fields */}
        {!useSimpleMode && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Property Name
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="e.g. Luxury Villa"
                  className="w-full p-2.5 border rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Location
                </label>
                <input
                  type="text"
                  name="location"
                  value={formData.location}
                  onChange={handleChange}
                  placeholder="e.g. Mumbai, India"
                  className="w-full p-2.5 border rounded-lg text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Describe the property..."
                rows={3}
                className="w-full p-2.5 border rounded-lg text-sm"
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type
                </label>
                <select
                  name="propertyType"
                  value={formData.propertyType}
                  onChange={handleChange}
                  className="w-full p-2.5 border rounded-lg text-sm bg-white"
                >
                  {PROPERTY_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Area (sq ft)
                </label>
                <input
                  type="text"
                  name="area"
                  value={formData.area}
                  onChange={handleChange}
                  placeholder="1500"
                  className="w-full p-2.5 border rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bedrooms
                </label>
                <input
                  type="number"
                  name="bedrooms"
                  value={formData.bedrooms}
                  onChange={handleChange}
                  placeholder="3"
                  className="w-full p-2.5 border rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bathrooms
                </label>
                <input
                  type="number"
                  name="bathrooms"
                  value={formData.bathrooms}
                  onChange={handleChange}
                  placeholder="2"
                  className="w-full p-2.5 border rounded-lg text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Year Built
                </label>
                <input
                  type="text"
                  name="yearBuilt"
                  value={formData.yearBuilt}
                  onChange={handleChange}
                  placeholder="2020"
                  className="w-full p-2.5 border rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Property Document (PDF)
                </label>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={(e) => setDocumentFile(e.target.files[0])}
                  className="w-full p-2 border rounded-lg text-sm"
                />
              </div>
            </div>
          </>
        )}

        {/* Price */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Price (ETH) *
          </label>
          <input
            type="number"
            step="0.01"
            name="price"
            value={formData.price}
            onChange={handleChange}
            placeholder="e.g. 10"
            className="w-full p-2.5 border rounded-lg text-sm"
            required
          />
        </div>

        {/* Upload progress */}
        {uploadStep && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm text-indigo-700 font-medium">
              {uploadStep}
            </span>
          </div>
        )}

        <button
          type="submit"
          disabled={isUploading}
          className="w-full bg-purple-600 text-white py-3 rounded-lg font-bold hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
        >
          {isUploading ? "Processing..." : "🚀 Mint & List Property"}
        </button>
      </form>
    </div>
  );
}