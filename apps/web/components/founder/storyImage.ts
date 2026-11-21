import { Node, mergeAttributes } from "@tiptap/react";
import { isOwnMediaUrl } from "@/lib/own-media";

/**
 * A picture inside a founder's story. Only the address and a description are kept (the server keeps the same two,
 * and only for pictures uploaded through our own media upload).
 */
export const StoryImage = Node.create({
  name: "image",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      src: { default: null },
      alt: { default: "" },
    };
  },
  parseHTML() {
    // Pasted pictures from other sites are left out here, as the server would drop them on save anyway.
    return [{ tag: "img[src]", getAttrs: (el) => (isOwnMediaUrl((el as HTMLElement).getAttribute("src")) ? null : false) }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes, { class: "story-editor-img" })];
  },
});
