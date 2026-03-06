"""
Synapse quickstart
==================

Step 1 — Ingest your documents:

    from synapse import ingest
    ingest("./docs")

Step 2 — Query from your agent (pure ChromaDB):
"""

import chromadb
from chromadb.utils import embedding_functions

# Connect to the database that synapse populated
ef = embedding_functions.SentenceTransformerEmbeddingFunction(
    model_name="all-MiniLM-L6-v2"
)
client = chromadb.PersistentClient(path="./synapse_db")
collection = client.get_collection("synapse", embedding_function=ef)  # type: ignore[arg-type]

# Ask a question — returns the most relevant chunks from your files
results = collection.query(
    query_texts=["What is the refund policy?"],
    n_results=5,
)

for i, (doc, meta) in enumerate(zip(results["documents"][0], results["metadatas"][0])):  # type: ignore[index]
    print(f"[{i+1}] Source: {meta['source']} (chunk {meta['chunk']})")
    print(f"     {doc[:200]}")
    print()
