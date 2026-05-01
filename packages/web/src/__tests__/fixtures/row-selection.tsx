import type { ReactElement } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type RowSelectionState,
} from '@tanstack/react-table';

export interface TestSelectionRow {
  id: string;
  label: string;
}

export function TestRowSelectionHarness({
  rows,
  rowSelection,
}: {
  rows: TestSelectionRow[];
  rowSelection?: RowSelectionState;
}): ReactElement {
  const columnHelper = createColumnHelper<TestSelectionRow>();
  const table = useReactTable({
    data: rows,
    columns: [
      columnHelper.display({
        id: 'select',
        cell: ({ row }) => (
          <input
            aria-label={`Select ${row.original.label}`}
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            type="checkbox"
          />
        ),
      }),
      columnHelper.accessor('label', { header: 'Label' }),
    ],
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    onRowSelectionChange: () => undefined,
    state: { rowSelection: rowSelection ?? {} },
    enableRowSelection: true,
  });

  return (
    <table>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
