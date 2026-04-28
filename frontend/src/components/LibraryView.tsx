import { useState } from 'react';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import WordsTable from './WordsTable';
import TextsTable from './TextsTable';
import TagsTable from './TagsTable';

type LibraryTab = 'words' | 'texts' | 'tags';

export default function LibraryView() {
  const [activeTab, setActiveTab] = useState<LibraryTab>('words');

  return (
    <div className="library-view">
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v as LibraryTab)}
        className="sub-tabs"
        textColor="primary"
        indicatorColor="primary"
      >
        <Tab label="Words" value="words" />
        <Tab label="Texts" value="texts" />
        <Tab label="Tags" value="tags" />
      </Tabs>

      {activeTab === 'words' && <WordsTable />}
      {activeTab === 'texts' && <TextsTable />}
      {activeTab === 'tags' && <TagsTable />}
    </div>
  );
}
