import { useState } from "react";
import WordsTable from "./WordsTable";
import TextsTable from "./TextsTable";

type Tab = "words" | "texts";

export default function LibraryView() {
  const [activeTab, setActiveTab] = useState<Tab>("words");

  return (
    <div className="library-view">
      <nav className="sub-tabs">
        <button
          className={`sub-tab ${activeTab === "words" ? "active" : ""}`}
          onClick={() => setActiveTab("words")}
        >
          Words
        </button>
        <button
          className={`sub-tab ${activeTab === "texts" ? "active" : ""}`}
          onClick={() => setActiveTab("texts")}
        >
          Texts
        </button>
      </nav>

      {activeTab === "words" ? <WordsTable /> : <TextsTable />}
    </div>
  );
}
