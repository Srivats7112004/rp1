// frontend/pages/marketplace.js
import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import Layout from '../components/Layout';
import PropertyCard from '../components/PropertyCard';
import { useWeb3 } from '../context/Web3Context';

export default function Marketplace() {
  const { account, provider, signer, realEstate, escrow, loadBlockchainData } = useWeb3();
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, verified, pending

  const loadProperties = useCallback(async () => {
    if (!realEstate || !escrow) return;

    setLoading(true);
    try {
      // Use Transfer events instead of totalSupply()
      const mintFilter = realEstate.filters.Transfer(
        ethers.constants.AddressZero,
        null
      );
      const mintEvents = await realEstate.queryFilter(mintFilter, 0, "latest");

      const tokenIds = [
        ...new Set(
          mintEvents
            .map((event) => event.args?.tokenId?.toNumber?.())
            .filter(Boolean)
        ),
      ].sort((a, b) => a - b);

      const loadedProperties = [];

      for (const tokenId of tokenIds) {
        try {
          const listing = await escrow.listings(tokenId);

          if (listing.isListed) {
            const uri = await realEstate.tokenURI(tokenId);
            const owner = await realEstate.ownerOf(tokenId);

            loadedProperties.push({
              id: tokenId,
              uri,
              image: uri,
              price: ethers.utils.formatEther(listing.purchasePrice),
              purchasePrice: listing.purchasePrice,
              escrowAmount: listing.escrowAmount,
              seller: listing.seller,
              buyer: listing.buyer,
              inspectionPassed: listing.inspectionPassed,
              lenderApproved: listing.lenderApproved,
              governmentVerified: listing.governmentVerified,
              sellerApproved: listing.sellerApproved,
              currentOwner: owner,
            });
          }
        } catch (err) {
          console.log(`Skipping token ${tokenId}:`, err.message);
        }
      }

      setProperties(loadedProperties);
    } catch (error) {
      console.error("Error loading properties:", error);
    } finally {
      setLoading(false);
    }
  }, [realEstate, escrow]);

  useEffect(() => {
    if (realEstate && escrow) {
      loadProperties();
    }
  }, [realEstate, escrow, loadProperties]);

  const handleBuy = async (property) => {
    try {
      const tx = await escrow.connect(signer).depositEarnest(property.id, {
        value: property.purchasePrice
      });
      await tx.wait();
      alert("Payment deposited successfully!");
      loadProperties();
      await loadBlockchainData();
    } catch (error) {
      console.error("Buy failed:", error);
      alert(error?.reason || error?.message || "Buy failed.");
    }
  };

  const handleInspect = async (propertyId) => {
    try {
      const tx = await escrow.connect(signer).updateInspectionStatus(propertyId, true);
      await tx.wait();
      alert("Inspection approved!");
      loadProperties();
      await loadBlockchainData();
    } catch (error) {
      console.error("Inspection failed:", error);
      alert(error?.reason || error?.message || "Inspection failed.");
    }
  };

  const handleLend = async (propertyId) => {
    try {
      const tx = await escrow.connect(signer).approveSale(propertyId);
      await tx.wait();
      alert("Loan approved!");
      loadProperties();
      await loadBlockchainData();
    } catch (error) {
      console.error("Lender approval failed:", error);
      alert(error?.reason || error?.message || "Lender approval failed.");
    }
  };

  const handleVerify = async (propertyId) => {
    try {
      const tx = await escrow.connect(signer).verifyProperty(propertyId);
      await tx.wait();
      alert("Property verified!");
      loadProperties();
      await loadBlockchainData();
    } catch (error) {
      console.error("Verification failed:", error);
      alert(error?.reason || error?.message || "Verification failed.");
    }
  };

  const handleSell = async (propertyId) => {
    try {
      let tx = await escrow.connect(signer).approveSale(propertyId);
      await tx.wait();
      
      tx = await escrow.connect(signer).finalizeSale(propertyId);
      await tx.wait();
      
      alert("Sale completed!");
      loadProperties();
      await loadBlockchainData();
    } catch (error) {
      console.error("Sale failed:", error);
      alert(error?.reason || error?.message || "Sale failed.");
    }
  };

  const filteredProperties = properties.filter(p => {
    if (filter === 'verified') return p.governmentVerified;
    if (filter === 'pending') return !p.governmentVerified;
    return true;
  });

  return (
    <Layout title="Marketplace">
      <div className="max-w-7xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-800 mb-4">
            🏠 Property Marketplace
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Browse verified properties and make secure blockchain-based transactions
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap justify-center gap-4 mb-8">
          {[
            { key: 'all', label: '📋 All Properties' },
            { key: 'verified', label: '✅ Verified Only' },
            { key: 'pending', label: '⏳ Pending Verification' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-6 py-2 rounded-full font-medium transition ${
                filter === key
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8 max-w-md mx-auto">
          <div className="bg-white rounded-xl p-4 text-center shadow">
            <p className="text-2xl font-bold text-gray-800">{properties.length}</p>
            <p className="text-sm text-gray-500">Total</p>
          </div>
          <div className="bg-white rounded-xl p-4 text-center shadow">
            <p className="text-2xl font-bold text-emerald-600">
              {properties.filter(p => p.governmentVerified).length}
            </p>
            <p className="text-sm text-gray-500">Verified</p>
          </div>
          <div className="bg-white rounded-xl p-4 text-center shadow">
            <p className="text-2xl font-bold text-amber-600">
              {properties.filter(p => !p.governmentVerified).length}
            </p>
            <p className="text-sm text-gray-500">Pending</p>
          </div>
        </div>

        {/* Properties Grid */}
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <svg className="animate-spin h-12 w-12 text-indigo-600" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : filteredProperties.length > 0 ? (
          <div className="grid gap-8 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {filteredProperties.map((property) => (
              <PropertyCard
                key={property.id}
                property={property}
                onBuy={handleBuy}
                onInspect={handleInspect}
                onLend={handleLend}
                onVerify={handleVerify}
                onSell={handleSell}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🏚️</div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">
              No Properties Found
            </h3>
            <p className="text-gray-600">
              {filter !== 'all' 
                ? 'Try changing your filter settings'
                : 'Be the first to list a property!'}
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}