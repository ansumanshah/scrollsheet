import {
  AutofocusSheets,
  SideSheet,
  SinglePxSideSheet,
  BasicSheet,
  ThemeColorSheet,
  CenterSheet,
  ResponsiveProfileSheet,
  ResponsiveSideSheet,
  ThreeDetentSheet,
  KeyboardSheet,
  ControlledSheet,
  MultiViewSheet,
  FillSheet,
  FullHeightSheet,
  NoTravelSheet,
  DetachedSheet,
  CenteredDesktopSheet,
  KeyboardExpandSheet,
  SideKeyboardSheet,
  InputTypesSheet,
  HandleDragAtMaxSheet,
  NoHandleSheet,
  AsChildSheet,
  ReopenSheet,
  GuardOptOutSheet,
  NonModalSheet,
  StackingDemo,
  MountToggleSheet,
  BackgroundEffectDemo,
  BackgroundRefSheet,
  SharedBackgroundRefSheets,
  UndimmedBackdropSheet,
  OutsideHandleSheet,
  OutsideHandleDetachedSheet,
  FloatingHandleSheet,
  HandleOnlySheet,
  DisableDragSheet,
  SequentialDetentSheet,
  CloseThresholdSheet,
  NonDismissibleWheelSheet,
  WheelLatchSheet,
  OnReleaseSheet,
  NestedScrollHandoffSheet,
  OnTravelSheet,
  ActionsRefSheet,
} from "./sheet";
import {
  DrawerFadeFromIndexOmittedSheet,
  DrawerCloseThresholdDefaultSheet,
  DrawerBackdropBlockedSheet,
  DrawerEscBlockedSheet,
  DrawerFadeFromIndexExplicitSheet,
  DrawerDirectionSheet,
  DrawerNestedRootSheet,
  DrawerSharedWrapperSheets,
  DrawerContentAsChildSheet,
  DrawerContentAsChildFragmentSheet,
} from "./drawer";
import { DialogAcceptanceModal } from "./dialog";
import { SonnerFixture, SonnerQueueFixture, SonnerShrinkFixture } from "./toast";

export function App() {
  return (
    <main className="page">
      <h1>scrollsheet e2e fixtures</h1>
      <div className="stack">
        {/* Must precede BackgroundEffectDemo below: its own
            #page-background-wrapper carries a permanent, unconditional
            data-scrollsheet-background attribute (not gated on any sheet
            being open), and the shouldScaleBackground bridge effect's own
            document-wide querySelector("[data-scrollsheet-background]")
            bails out the instant it finds ANY such marker it doesn't already
            own (see src/drawer/index.tsx's Root, "A consumer's own scrollsheet
            target ... is always respected untouched") — so this fixture's
            OWN [data-vaul-drawer-wrapper] target must be the first such
            marker in document order, or the bridge never reaches it at all. */}
        <DrawerSharedWrapperSheets />
        <SideSheet side="left" trigger="Side left" />
        <SideSheet side="right" trigger="Side right" />
        <SideSheet side="top" trigger="Side top" />
        <SinglePxSideSheet side="left" trigger="Side left (300px)" />
        <SinglePxSideSheet side="right" trigger="Side right (300px)" />
        <SinglePxSideSheet side="top" trigger="Side top (300px)" />
        <NonModalSheet />
        <StackingDemo />
        <BackgroundEffectDemo />
        <BackgroundRefSheet />
        <SharedBackgroundRefSheets />
        <FullHeightSheet />
        <HandleDragAtMaxSheet />
        <DetachedSheet />
        <NoTravelSheet />
        <CenteredDesktopSheet />
        <InputTypesSheet />
        <KeyboardExpandSheet />
        <SideKeyboardSheet />
        <AutofocusSheets />
        <NoHandleSheet side="bottom" trigger="No handle bottom" />
        <NoHandleSheet side="top" trigger="No handle top" />
        <NoHandleSheet side="left" trigger="No handle left" />
        <NoHandleSheet side="right" trigger="No handle right" />
        <NoHandleSheet side="bottom" modal={false} trigger="No handle non-modal" />
        <OutsideHandleSheet />
        <OutsideHandleDetachedSheet />
        <FloatingHandleSheet />
        <BasicSheet />
        <ThemeColorSheet />
        <CenterSheet />
        <ResponsiveProfileSheet />
        <ResponsiveSideSheet />
        <DialogAcceptanceModal trigger="Dialog acceptance modal" />
        <DialogAcceptanceModal
          trigger="Dialog acceptance modal (backdrop blocked)"
          backdropDismissible={false}
        />
        <ThreeDetentSheet />
        <KeyboardSheet />
        <ControlledSheet />
        <MultiViewSheet />
        <FillSheet />
        <AsChildSheet />
        <ReopenSheet />
        <GuardOptOutSheet />
        <MountToggleSheet />
        <UndimmedBackdropSheet />
        <HandleOnlySheet />
        <DisableDragSheet />
        <SequentialDetentSheet />
        <CloseThresholdSheet />
        <WheelLatchSheet closeThreshold={0.9} trigger="Wheel latch high threshold" />
        <WheelLatchSheet closeThreshold={0.1} trigger="Wheel latch low threshold" />
        <NonDismissibleWheelSheet />
        <OnReleaseSheet />
        <OnTravelSheet
          trigger="onTravel single detent sheet"
          title="onTravel single"
          detents={[0.5]}
        />
        <OnTravelSheet
          trigger="onTravel multi detent sheet"
          title="onTravel multi"
          detents={[0.5, "full"]}
        />
        <ActionsRefSheet />
        <DrawerFadeFromIndexOmittedSheet />
        <NestedScrollHandoffSheet trigger="Nested scroll handoff sheet" />
        <NestedScrollHandoffSheet
          trigger="Nested scroll handoff sheet (starts empty)"
          initialVisible={false}
        />
        <DrawerCloseThresholdDefaultSheet />
        <DrawerBackdropBlockedSheet />
        <DrawerEscBlockedSheet />
        <DrawerFadeFromIndexExplicitSheet />
        <DrawerDirectionSheet direction="top" trigger="Drawer direction top sheet" />
        <DrawerDirectionSheet direction="left" trigger="Drawer direction left sheet" />
        <DrawerDirectionSheet direction="right" trigger="Drawer direction right sheet" />
        <DrawerNestedRootSheet />
        <DrawerContentAsChildSheet />
        <DrawerContentAsChildFragmentSheet />
        <SonnerFixture />
        <SonnerQueueFixture />
        <SonnerShrinkFixture />
      </div>
      <section className="filler">
        {Array.from({ length: 20 }, (_, i) => (
          <p key={i}>Background paragraph {i + 1}.</p>
        ))}
      </section>
    </main>
  );
}
