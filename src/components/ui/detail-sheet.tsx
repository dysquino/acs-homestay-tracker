"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { EditIcon, TrashIcon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";

export type DetailField = { label: string; value: ReactNode };

/**
 * A record's details, opened by tapping a row — everything the compact row
 * leaves out, with the record's Edit / Delete actions at the bottom. Leave
 * out `onEdit`/`onDelete` for a record that can't be changed here (e.g. an
 * expense managed from the Cleaning page) and explain why in `note`.
 */
export function DetailSheet({
  open,
  onClose,
  title,
  tags,
  fields,
  body,
  note,
  actions,
  onEdit,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  tags?: ReactNode;
  fields: DetailField[];
  /**
   * Free-form content rendered between the fields list and the optional
   * note. Used by the booking list to show photos with attach/view/remove
   * modals — bit-heavy to fit a DetailField value, so it lives in its own
   * slot.
   */
  body?: ReactNode;
  note?: ReactNode;
  /** Extra record-specific buttons (e.g. "Mark paid"), shown before Edit. */
  actions?: ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const hasFooter = Boolean(onEdit || onDelete || actions);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={tags ? <span className="mt-1 flex flex-wrap gap-1.5">{tags}</span> : undefined}
      footer={
        hasFooter ? (
          <div className="flex w-full flex-wrap items-center gap-2">
            {onDelete ? (
              <Button variant="danger" onClick={onDelete}>
                <TrashIcon className="h-4 w-4" />
                Delete
              </Button>
            ) : null}
            <div className="ml-auto flex flex-wrap gap-2">
              {actions}
              {onEdit ? (
                <Button variant="primary" onClick={onEdit}>
                  <EditIcon className="h-4 w-4" />
                  Edit
                </Button>
              ) : null}
            </div>
          </div>
        ) : undefined
      }
    >
      <dl className="divide-y divide-slate-100">
        {fields.map((f) => (
          <div key={f.label} className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
            <dt className="shrink-0 text-slate-500">{f.label}</dt>
            <dd className="min-w-0 text-right break-words text-slate-900">{f.value}</dd>
          </div>
        ))}
      </dl>
      {body ? <div className="mt-3">{body}</div> : null}
      {note ? <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{note}</p> : null}
    </Modal>
  );
}
