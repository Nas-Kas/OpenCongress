import React, { useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

export default function AskBill({ congress, billType, billNumber }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isEmbedded, setIsEmbedded] = useState(null);
  const [embedding, setEmbedding] = useState(false);
  const [embeddingProgress, setEmbeddingProgress] = useState(null);

  const checkIfEmbedded = async () => {
    try {
      const response = await fetch(
        `${API_URL}/bill/${congress}/${billType}/${billNumber}/ask`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: 'test' })
        }
      );
      
      if (response.status === 404) {
        setIsEmbedded(false);
        return;
      }
      
      const data = await response.json();
      
      // If we got a success response with chunks_used, it's embedded
      if (data.success && data.chunks_used !== undefined) {
        setIsEmbedded(true);
      } else if (data.answer && data.answer.includes('not been embedded')) {
        setIsEmbedded(false);
      } else {
        // Default to embedded if we got a successful response
        setIsEmbedded(true);
      }
    } catch (err) {
      console.error('Error checking embedding status:', err);
      setIsEmbedded(null); // Unknown state
    }
  };

  React.useEffect(() => {
    checkIfEmbedded();
  }, [congress, billType, billNumber]);

  const handleEmbed = async () => {
    setEmbedding(true);
    setError(null);
    setEmbeddingProgress('Starting embedding process (this may take a few minutes)...');

    try {
      setEmbeddingProgress('Looking up PDF URL from database...');
      
      const embedResponse = await fetch(
        `${API_URL}/bill/${congress}/${billType}/${billNumber}/embed`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdf_url: '' })  // Empty - backend will look it up
        }
      );

      if (!embedResponse.ok) {
        const errorData = await embedResponse.json();
        throw new Error(errorData.detail || 'Failed to embed bill');
      }

      const data = await embedResponse.json();
      setEmbeddingProgress(`✓ Successfully embedded ${data.chunks} chunks!`);
      setIsEmbedded(true);
      
      // Clear progress message after 3 seconds
      setTimeout(() => setEmbeddingProgress(null), 3000);
    } catch (err) {
      setError(`Embedding failed: ${err.message}`);
      setEmbedding(false);
    }
  };

  const handleAsk = async (e) => {
    e.preventDefault();
    if (!question.trim()) return;

    setLoading(true);
    setError(null);
    setAnswer(null);

    try {
      const response = await fetch(
        `${API_URL}/bill/${congress}/${billType}/${billNumber}/ask`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to get answer');
      }

      const data = await response.json();
      setAnswer(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const exampleQuestions = [
    "What does this bill do?",
    "How much spending is in this bill?",
    "Who does this bill affect?",
    "What are the key provisions?",
    "When does this bill take effect?"
  ];

  if (isEmbedded === false) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <h3 className="font-semibold text-yellow-800 mb-2">⚠️ Bill Not Embedded Yet</h3>
        <p className="text-sm text-yellow-700 mb-3">
          This bill hasn't been processed for Q&A yet. Click the button below to embed it (this may take a few minutes for large bills).
        </p>
        <button
          onClick={handleEmbed}
          disabled={embedding}
          className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium text-sm"
        >
          {embedding ? (
            <span className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white border-t-yellow-600 rounded-full animate-spin" />
              {embeddingProgress || 'Embedding...'}
            </span>
          ) : (
            '🚀 Embed This Bill for Q&A'
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
      <h3 className="text-xl font-bold mb-2">💬 Ask This Bill a Question</h3>
      <p className="text-sm text-gray-600 mb-4">
        Use AI to get answers about this bill's content, provisions, and impact.
      </p>

      <form onSubmit={handleAsk} className="mb-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g., How much spending is in this bill?"
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
          >
            {loading ? 'Thinking...' : 'Ask'}
          </button>
        </div>
      </form>

      {/* Example Questions */}
      <div className="mb-4">
        <p className="text-xs text-gray-500 mb-2">Try asking:</p>
        <div className="flex flex-wrap gap-2">
          {exampleQuestions.map((q, i) => (
            <button
              key={i}
              onClick={() => setQuestion(q)}
              className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700"
              disabled={loading}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-red-700">❌ {error}</p>
        </div>
      )}

      {/* Answer */}
      {answer && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="text-2xl">🤖</div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-blue-900 mb-2">Answer:</p>
              <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                {answer.answer}
              </div>
              <p className="text-xs text-gray-500 mt-3">
                Based on {answer.chunks_used} of {answer.total_chunks} text sections
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
