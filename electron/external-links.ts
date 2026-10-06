import type { WebContents } from "electron";

export function configureExternalLinks(
  contents: Pick<WebContents, "on" | "setWindowOpenHandler">,
  appUrl: string,
  openExternal: (url: string) => Promise<void>,
) {
  const application = new URL(appUrl);

  const isInternal = (url: string) => {
    try {
      const target = new URL(url);
      return (
        target.protocol === application.protocol &&
        target.host === application.host &&
        target.username === "" &&
        target.password === ""
      );
    } catch {
      return false;
    }
  };

  const openLink = (url: string) => {
    try {
      const target = new URL(url);
      if (!["http:", "https:", "mailto:"].includes(target.protocol)) return;
      void openExternal(url).catch((error) => {
        console.error("Failed to open external link:", error);
      });
    } catch {
      return;
    }
  };

  contents.setWindowOpenHandler(({ url }) => {
    if (!isInternal(url)) openLink(url);
    return { action: "deny" };
  });

  const handleNavigation = (event: Electron.Event, url: string) => {
    if (isInternal(url)) return;
    event.preventDefault();
    openLink(url);
  };

  contents.on("will-navigate", handleNavigation);
  contents.on("will-redirect", handleNavigation);
}
