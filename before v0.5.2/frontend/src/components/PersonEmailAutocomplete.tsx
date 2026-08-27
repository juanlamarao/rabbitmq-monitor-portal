import { Autocomplete, TextField } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiRequest } from '../services/api';
import { DirectoryPerson } from '../types/api';

function optionToEmail(option: DirectoryPerson | string | null): string {
  if (!option) return '';
  return typeof option === 'string' ? option : option.email;
}

function optionLabel(option: DirectoryPerson | string): string {
  if (typeof option === 'string') return option;
  return `${option.full_name} <${option.email}>`;
}

function useDirectoryOptions(inputValue: string) {
  return useQuery({
    queryKey: ['directory-people', inputValue],
    enabled: inputValue.trim().length > 0,
    queryFn: () => apiRequest<DirectoryPerson[]>(`/directory/people?query=${encodeURIComponent(inputValue)}&limit=5`),
    staleTime: 60_000,
  });
}

export function SinglePersonEmailAutocomplete({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [inputValue, setInputValue] = useState(value || '');
  const { data: options = [], isFetching } = useDirectoryOptions(inputValue);

  return (
    <Autocomplete<DirectoryPerson | string, false, false, true>
      freeSolo
      disabled={disabled}
      options={options}
      value={value || null}
      inputValue={inputValue}
      loading={isFetching}
      filterOptions={(items) => items}
      getOptionLabel={optionLabel}
      onInputChange={(_, nextValue) => setInputValue(nextValue)}
      onChange={(_, nextValue) => onChange(optionToEmail(nextValue))}
      renderInput={(params) => <TextField {...params} label={label} fullWidth />}
    />
  );
}

export function MultiPersonEmailAutocomplete({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}) {
  const [inputValue, setInputValue] = useState('');
  const { data: options = [], isFetching } = useDirectoryOptions(inputValue);

  return (
    <Autocomplete<DirectoryPerson | string, true, false, true>
      multiple
      freeSolo
      disabled={disabled}
      options={options}
      value={value}
      inputValue={inputValue}
      loading={isFetching}
      filterOptions={(items) => items}
      getOptionLabel={optionLabel}
      onInputChange={(_, nextValue) => setInputValue(nextValue)}
      onChange={(_, nextValue) => {
        const emails = nextValue.map((item) => optionToEmail(item)).filter(Boolean);
        onChange(Array.from(new Set(emails.map((email) => email.toLowerCase()))));
      }}
      renderInput={(params) => <TextField {...params} label={label} fullWidth />}
    />
  );
}
