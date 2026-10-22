import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import SearchBar from '../src/components/SearchBar.jsx';
import { installFetch, jsonRes } from './utils.jsx';

describe('SearchBar', () => {
  it('debounces autocomplete requests and renders keyboard-accessible suggestions', async () => {
    const fetchMock = installFetch(() => jsonRes(200, {
      suggestions: [{ id: 'doc-1', title: 'Data Integration Using Pandas', subject: 'Data Science', fileExtension: 'docx' }],
    }));
    render(<MemoryRouter><SearchBar /></MemoryRouter>);
    const input = screen.getByRole('textbox', { name: /search documents/i });
    await userEvent.type(input, 'pandas');
    await waitFor(() => expect(screen.getByRole('option', { name: /Data Integration Using Pandas/i })).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/search/suggestions?q=pandas');
  });
});

