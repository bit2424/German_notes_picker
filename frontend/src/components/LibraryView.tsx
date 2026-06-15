import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
        onValueChange={(v) => setActiveTab(v as LibraryTab)}
        className="sub-tabs"
      >
        <TabsList>
          <TabsTrigger value="words">Words</TabsTrigger>
          <TabsTrigger value="texts">Texts</TabsTrigger>
          <TabsTrigger value="tags">Tags</TabsTrigger>
        </TabsList>
      </Tabs>

      {activeTab === 'words' && <WordsTable />}
      {activeTab === 'texts' && <TextsTable />}
      {activeTab === 'tags' && <TagsTable />}
    </div>
  );
}
