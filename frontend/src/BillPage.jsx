import { useEffect, useState } from "react";
import AskBill from "./AskBill";
import { LoadingSpinner, ErrorMessage } from "./components";

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

export default function BillPage({ billData: initialBillData, congress, billType, billNumber, onBack, onOpenRoll }) {
  const [billData, setBillData] = useState(initialBillData || null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(!initialBillData);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [error, setError] = useState(null);
  const [summaryError, setSummaryError] = useState(null);
  const [expandTitle, setExpandTitle] = useState(false);

  useEffect(() => {
    // If we already have bill data passed in, use it immediately
    if (initialBillData && initialBillData.title && initialBillData.votes) {
      setBillData(initialBillData);
      setLoading(false);
      return;
    }

    // Don't fetch if we don't have valid bill identifiers
    if (!congress || !billType || !billNumber) {
      console.log("Missing bill identifiers:", { congress, billType, billNumber });
      return;
    }

    const fetchBillData = async () => {
      setLoading(true);
      setError(null);

      try {
        console.log("Fetching bill data for:", { congress, billType, billNumber });

        // Fetch bill details and votes from the dedicated bill endpoint
        const billResponse = await fetch(
          `${API_URL}/bill/${congress}/${billType}/${billNumber}`
        );

        if (!billResponse.ok) {
          throw new Error(`Failed to fetch bill: ${billResponse.statusText}`);
        }

        const billData = await billResponse.json();
        console.log("Fetched bill data:", billData);

        const finalBillData = {
          congress: billData.bill.congress,
          billType: billData.bill.billType,
          billNumber: billData.bill.billNumber,
          title: billData.bill.title || `${billType.toUpperCase()} ${billNumber}`,
          introducedDate: billData.bill.introducedDate,
          latestAction: billData.bill.latestAction,
          publicUrl: billData.bill.publicUrl,
          textVersions: billData.bill.textVersions,
          votes: billData.votes || []
        };

        console.log("Setting bill data:", finalBillData);
        setBillData(finalBillData);
      } catch (err) {
        console.error("Error fetching bill data:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchBillData();
  }, [congress, billType, billNumber, initialBillData]);

  useEffect(() => {
    console.log("Full bill data:", billData);
  }, [billData]);

  const generateSummary = async () => {
    setSummaryLoading(true);
    setSummaryError(null);

    try {
      // Try the generate-summary endpoint, but handle if it doesn't exist
      const response = await fetch(
        `${API_URL}/bill/${congress}/${billType}/${billNumber}/generate-summary`,
        { method: 'POST' }
      );

      if (response.status === 405 || response.status === 404) {
        // If the endpoint doesn't exist, create a mock summary for now
        setSummary({
          tldr: "AI bill summary generation is not yet available for this bill. This feature is coming soon!",
          keyPoints: [
            "Bill analysis and summarization features are in development",
            "Check back later for AI-powered insights",
            "You can still view bill details and voting history below"
          ],
          importance: 3,
          readingTime: "2-3 minutes"
        });
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to generate summary: ${response.statusText}`);
      }

      const data = await response.json();
      setSummary(data);
    } catch (err) {
      setSummaryError(err.message);
    } finally {
      setSummaryLoading(false);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading bill details..." />;
  }

  if (error) {
    return <ErrorMessage message={error} title="Error loading bill:" />;
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={onBack}
          className="mb-4 px-4 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 cursor-pointer"
        >
          ← Back
        </button>

        <div className="mb-4">
          <div className="flex items-center gap-3 mb-2">
            <span className="bg-blue-600 text-white px-3 py-1 rounded text-sm font-semibold">
              {billType.toUpperCase()} {billNumber}
            </span>
            <span className="text-sm text-gray-500">
              {congress}th Congress
            </span>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {billData?.title ? (
              <>
                {expandTitle ? billData.title : billData.title.substring(0, 80) + "..."}
                {billData.title.length > 80 && (
                  <button onClick={() => setExpandTitle(!expandTitle)} className="text-sm text-blue-600 ml-2">
                    {expandTitle ? 'Show less' : 'Show more'}
                  </button>
                )}
              </>
            ) : (
              `${billType.toUpperCase()} ${billNumber}`
            )}
          </h1>

          {billData?.introducedDate && (
            <p className="text-sm text-gray-500 mb-3">
              Introduced: {new Date(billData.introducedDate).toLocaleDateString()}
            </p>
          )}

          {/* Quick Links */}
          <div className="flex gap-2 flex-wrap items-center">
            {billData?.publicUrl && (
              <a
                href={billData.publicUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50 text-gray-700 font-medium"
              >
                📄 Congress.gov
              </a>
            )}
            {billData?.textVersions && billData.textVersions.length > 0 && billData.textVersions[0].url && (
              <a
                href={billData.textVersions[0].url}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50 text-gray-700 font-medium"
              >
                📑 View PDF
              </a>
            )}
            {billData?.textVersions && billData.textVersions.length > 0 && billData.textVersions[0].formats && (
              <>
                {billData.textVersions[0].formats.find(f => f.type === 'Formatted Text') && (
                  <a
                    href={billData.textVersions[0].formats.find(f => f.type === 'Formatted Text').url}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50 text-gray-700 font-medium"
                  >
                    📋 Full Text
                  </a>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Bill Details */}
      <div className="bg-white border border-gray-300 rounded-lg shadow-sm mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">📋 Bill Details</h2>
        </div>

        <div className="px-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">Bill Type</h3>
              <p className="text-gray-700 mb-4">
                {billType.toUpperCase()} - {
                  billType.toLowerCase() === 'hres' ? 'House Resolution' :
                    billType.toLowerCase() === 'hr' ? 'House Bill' :
                      billType.toLowerCase() === 'sres' ? 'Senate Resolution' :
                        billType.toLowerCase() === 's' ? 'Senate Bill' :
                          billType.toLowerCase() === 'hjres' ? 'House Joint Resolution' :
                            billType.toLowerCase() === 'sjres' ? 'Senate Joint Resolution' :
                              'Congressional Legislation'
                }
              </p>

              <h3 className="font-semibold text-gray-900 mb-1">Congress</h3>
              <p className="text-gray-700 mb-4">{congress}th Congress (2025-2026)</p>

              {billData?.votes && billData.votes.length > 0 && (
                <>
                  <h3 className="font-semibold text-gray-900 mb-1">Vote History</h3>
                  <p className="text-gray-700">{billData.votes.length} roll call vote{billData.votes.length !== 1 ? 's' : ''}</p>
                </>
              )}
            </div>

            <div>
              {billData?.sponsor && (
                <>
                  <h3 className="font-semibold text-gray-900 mb-1">Sponsor</h3>
                  <p className="text-gray-700 mb-4">{billData.sponsor}</p>
                </>
              )}

              {billData?.committees && billData.committees.length > 0 && (
                <>
                  <h3 className="font-semibold text-gray-900 mb-1">Committees</h3>
                  <ul className="text-gray-700 mb-4">
                    {billData.committees.map((committee, index) => (
                      <li key={index}>{committee}</li>
                    ))}
                  </ul>
                </>
              )}

              {billData?.introducedDate && (
                <>
                  <h3 className="font-semibold text-gray-900 mb-1">Introduced</h3>
                  <p className="text-gray-700 mb-4">
                    {new Date(billData.introducedDate).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                </>
              )}
            </div>

            {billData?.latestAction && (
              <div className="md:col-span-2">
                <h3 className="font-semibold text-gray-900 mb-1">Latest Action</h3>
                <p className="text-gray-700">
                  {typeof billData.latestAction === 'object' 
                    ? billData.latestAction.text 
                    : billData.latestAction}
                </p>
              </div>
            )}
          </div>

          {(!billData?.sponsor && !billData?.committees && !billData?.latestAction && !billData?.introducedDate) && (
            <div className="text-center py-4 text-gray-500">
              <p>Additional bill details are not available in our database.</p>
              <p className="text-sm mt-1">You can view voting history and generate an AI summary below.</p>
            </div>
          )}
        </div>
      </div>

      {/* Bill Summary Section */}
      <div className="bg-white border border-gray-300 rounded-lg shadow-sm mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">📄 AI Bill Summary</h2>
            <button
              onClick={generateSummary}
              disabled={summaryLoading}
              className={`px-4 py-2 rounded-lg font-medium ${summaryLoading
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
                }`}
            >
              {summaryLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
                  Generating...
                </div>
              ) : (
                summary ? "Regenerate Summary" : "Generate Summary"
              )}
            </button>
          </div>
        </div>

        <div className="px-6 py-4">
          {summaryError && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
              <strong>Error:</strong> {summaryError}
            </div>
          )}

          {summary ? (
            <div className="prose max-w-none">
              {/* Display the full Gemini summary with basic markdown formatting */}
              <div className="mb-4">
                <div className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {summary.tldr.split('\n').map((line, index) => {
                    // Handle markdown-style headers
                    if (line.startsWith('## ')) {
                      return (
                        <h3 key={index} className="text-lg font-semibold mt-6 mb-3 text-gray-900">
                          {line.replace('## ', '')}
                        </h3>
                      );
                    }
                    // Handle bold text
                    if (line.includes('**')) {
                      const parts = line.split('**');
                      return (
                        <p key={index} className="mb-2">
                          {parts.map((part, i) => 
                            i % 2 === 1 ? <strong key={i}>{part}</strong> : part
                          )}
                        </p>
                      );
                    }
                    // Handle bullet points
                    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
                      return (
                        <li key={index} className="ml-4 mb-1">
                          {line.trim().substring(2)}
                        </li>
                      );
                    }
                    // Handle numbered lists
                    if (line.trim().match(/^\d+\.\s/)) {
                      return (
                        <li key={index} className="ml-4 mb-1 list-decimal">
                          {line.trim().replace(/^\d+\.\s/, '')}
                        </li>
                      );
                    }
                    // Regular paragraphs
                    if (line.trim()) {
                      return <p key={index} className="mb-3">{line}</p>;
                    }
                    // Empty lines
                    return <br key={index} />;
                  })}
                </div>
              </div>

              {/* Show metadata at the bottom */}
              <div className="mt-6 pt-4 border-t border-gray-200 flex items-center justify-between text-sm text-gray-500">
                <div className="flex items-center gap-4">
                  {summary.importance && (
                    <div className="flex items-center gap-1">
                      <span>Importance:</span>
                      <div className="flex">
                        {[...Array(5)].map((_, i) => (
                          <span
                            key={i}
                            className={`text-sm ${i < summary.importance ? "text-yellow-400" : "text-gray-300"}`}
                          >
                            ⭐
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {summary.readingTime && (
                    <span>📖 Reading time: {summary.readingTime}</span>
                  )}
                </div>
                {summary.cached && (
                  <span className="text-green-600">✓ Cached</span>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <div className="text-4xl mb-2">🤖</div>
              <p>Click "Generate Summary" to create an AI-powered analysis of this bill.</p>
              <p className="text-sm mt-2">
                Our AI will analyze the bill text and provide key insights, financial impact, and importance scoring.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Ask Bill RAG Component */}
      <AskBill 
        congress={congress} 
        billType={billType} 
        billNumber={billNumber} 
      />

      {/* Roll Call Votes */}
      {!billData ? (
        <div className="bg-white border border-gray-300 rounded-lg shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">🗳️ Roll Call Votes</h2>
          </div>
          <div className="px-6 py-8 text-center text-gray-500">
            <div className="animate-spin inline-block w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full"></div>
            <p className="mt-2">Loading votes...</p>
          </div>
        </div>
      ) : billData.votes && billData.votes.length > 0 ? (
        <div className="bg-white border border-gray-300 rounded-lg shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">🗳️ Roll Call Votes ({billData.votes.length})</h2>
          </div>

          <div className="px-6 py-4">
            <div className="space-y-3">
              {billData.votes.map((vote, index) => (
                <div key={vote.roll || index} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 mb-1">
                      Roll #{vote.roll} - {vote.question || "Vote on the Resolution"}
                    </div>
                    <div className="text-sm text-gray-500 mb-2">
                      {vote.started && new Date(vote.started).toLocaleDateString()} •
                      Result: <span className={`font-medium ${vote.result?.toLowerCase().includes('pass') || vote.result?.toLowerCase().includes('agreed')
                          ? 'text-green-600'
                          : vote.result?.toLowerCase().includes('fail')
                            ? 'text-red-600'
                            : 'text-gray-600'
                        }`}>
                        {vote.result || "Unknown"}
                      </span>
                    </div>
                    {vote.yeaCount !== undefined && (
                      <div className="flex gap-4 text-xs text-gray-600">
                        <span className="text-green-600">Yea: {vote.yeaCount || 0}</span>
                        <span className="text-red-600">Nay: {vote.nayCount || 0}</span>
                        <span className="text-gray-500">Present: {vote.presentCount || 0}</span>
                        <span className="text-amber-600">Not Voting: {vote.notVotingCount || 0}</span>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => onOpenRoll && onOpenRoll({
                      congress: vote.congress || congress,
                      session: vote.session || 1,
                      roll: vote.roll
                    })}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer text-sm font-medium"
                  >
                    View Details
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-300 rounded-lg shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">🗳️ Roll Call Votes</h2>
          </div>

          <div className="px-6 py-8 text-center text-gray-500">
            <div className="text-4xl mb-2">📭</div>
            <p>No roll call votes found for this bill.</p>
            <p className="text-sm mt-1">This bill may not have been voted on yet, or votes may not be available in our database.</p>
          </div>
        </div>
      )}

    </div>
  );
}