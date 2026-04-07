import { useState } from "react";
import VocabularyTable from "./VocabularyTable";
import SentencesTable from "./SentencesTable";

type Tab = "vocabulary" | "sentences";

export default function LibraryView() {
  const [activeTab, setActiveTab] = useState<Tab>("vocabulary");

  return (
    <div className="library-view">
      <nav className="sub-tabs">
        <button
          className={`sub-tab ${activeTab === "vocabulary" ? "active" : ""}`}
          onClick={() => setActiveTab("vocabulary")}
        >
          Vocabulary
        </button>
        <button
          className={`sub-tab ${activeTab === "sentences" ? "active" : ""}`}
          onClick={() => setActiveTab("sentences")}
        >
          Sentences
        </button>
      </nav>

      {activeTab === "vocabulary" ? <VocabularyTable /> : <SentencesTable />}
    </div>
  );
}
