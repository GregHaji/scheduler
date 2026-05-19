import type { CollectionConfig } from 'payload'

export const Staff: CollectionConfig = {
  slug: 'staff',

  fields: [
    {
      name: 'employeeId',
      type: 'text',
      required: true,
    },
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'initials',
      type: 'text',
    },

    {
      name: 'workgroups',
      type: 'json',
    },
    {
      name: 'availability',
      type: 'json',
    },
    {
      name: 'maxHours',
      type: 'number',
    },
    {
      name: 'preferredWindow',
      type: 'json',
    },
  ],
}
