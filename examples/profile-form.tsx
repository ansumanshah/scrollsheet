import { Sheet } from "scrollsheet";

/**
 * A text input inside a sheet, with enough fields below it to test on-device
 * keyboard avoidance: focusing a field should bring it above the software
 * keyboard rather than letting the keyboard cover it.
 */
export default function ProfileFormExample() {
  return (
    <Sheet.Root detents={[0.6, "full"]} handleOnly themeColorDimming>
      <Sheet.Trigger className="ex-trigger">Edit profile</Sheet.Trigger>
      <Sheet.Content className="ex-panel" aria-label="Edit profile">
        <Sheet.Handle />
        <div className="ex-panel-body">
          <Sheet.Title>Edit profile</Sheet.Title>
          <Sheet.Description>
            On a real device, focus a field below and confirm the on-screen keyboard never covers
            it.
          </Sheet.Description>
          <div className="ex-field">
            <label className="ex-label" htmlFor="ex-profile-name">
              Name
            </label>
            <input id="ex-profile-name" className="ex-input" defaultValue="Priya Nair" />
          </div>
          <div className="ex-field">
            <label className="ex-label" htmlFor="ex-profile-email">
              Email
            </label>
            <input
              id="ex-profile-email"
              type="email"
              className="ex-input"
              defaultValue="priya@example.com"
            />
          </div>
          <div className="ex-field">
            <label className="ex-label" htmlFor="ex-profile-location">
              Location
            </label>
            <input id="ex-profile-location" className="ex-input" defaultValue="Bengaluru, India" />
          </div>
          <div className="ex-field">
            <label className="ex-label" htmlFor="ex-profile-bio">
              Bio
            </label>
            <textarea
              id="ex-profile-bio"
              className="ex-textarea"
              rows={3}
              defaultValue="Product designer working on developer tools. Coffee, trail running, and side projects that never ship."
            />
          </div>
          <button
            type="button"
            className="ex-btn ex-btn-primary ex-btn-block"
            data-scrollsheet-no-drag
          >
            Save changes
          </button>
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}
