import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Table, TableHead, TableHeader, TableRow } from '../table';

describe('TableHead', () => {
  it('defaults header cells to column scope', () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
          </TableRow>
        </TableHeader>
      </Table>,
    );

    expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute('scope', 'col');
  });
});
