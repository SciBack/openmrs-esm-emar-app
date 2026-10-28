import React, { useEffect, useRef, useState } from 'react';
import { ComboBox } from '@carbon/react';

export interface SearchItem {
  uuid: string;
  display: string;
}

interface AsyncSearchProps {
  id: string;
  titleText: string;
  placeholder?: string;
  invalid?: boolean;
  invalidText?: string;
  helperText?: string;
  search: (query: string, signal: AbortSignal) => Promise<Array<SearchItem>>;
  onSelect: (item: SearchItem | null) => void;
  selected?: SearchItem | null;
}

/** Carbon ComboBox with server-side search (providers, drugs). */
export const AsyncSearch: React.FC<AsyncSearchProps> = ({
  id,
  titleText,
  placeholder,
  invalid,
  invalidText,
  helperText,
  search,
  onSelect,
  selected,
}) => {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Array<SearchItem>>(selected ? [selected] : []);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!query || query.trim().length < 2) {
      return;
    }
    const current = new AbortController();
    const timer = setTimeout(() => {
      controller.current?.abort();
      controller.current = current;
      search(query, current.signal)
        .then((results) => {
          if (!current.signal.aborted) {
            setItems(results);
          }
        })
        .catch(() => {
          if (!current.signal.aborted) {
            setItems([]);
          }
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      current.abort();
    };
  }, [query, search]);

  return (
    <ComboBox
      id={id}
      titleText={titleText}
      placeholder={placeholder}
      helperText={helperText}
      invalid={invalid}
      invalidText={invalidText}
      items={items}
      itemToString={(item: SearchItem | null) => item?.display ?? ''}
      selectedItem={selected ?? null}
      onInputChange={(value: string) => setQuery(value ?? '')}
      onChange={({ selectedItem }: { selectedItem: SearchItem | null }) => onSelect(selectedItem ?? null)}
      shouldFilterItem={() => true}
    />
  );
};
