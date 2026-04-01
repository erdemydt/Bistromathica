import { Mark, mergeAttributes } from '@tiptap/core';

export const CitationMark = Mark.create({
  name: 'citation',

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-citation'),
        renderHTML: (attrs) => ({ 'data-citation': attrs.id }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'sup[data-citation]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'sup',
      mergeAttributes(HTMLAttributes, { class: 'citation-mark' }),
      0,
    ];
  },

  inclusive: false,
});
