import type { DetailedHTMLProps, HTMLAttributes } from "react";

// Chrome's built-in camera controls (<camera>, and the earlier <usermedia>). Other browsers ignore them.
declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      camera: DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
      usermedia: DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}
