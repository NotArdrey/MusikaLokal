import React from "react";
import {
  Calendar as NativeCalendar,
  type CalendarProps,
} from "react-native-calendars";

const CENTERED_DAY_STYLES = {
  base: {
    width: 32,
    height: 32,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    alignSelf: "center" as const,
  },
  selected: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    alignSelf: "center" as const,
  },
  today: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    alignSelf: "center" as const,
  },
  text: {
    marginTop: 0,
    includeFontPadding: false,
    textAlign: "center" as const,
    textAlignVertical: "center" as const,
  },
};

export function CenteredCalendar(props: CalendarProps) {
  const existingTheme = props.theme as
    | (CalendarProps["theme"] & Record<string, any>)
    | undefined;
  const existingDayStyles = existingTheme?.["stylesheet.day.basic"] ?? {};

  const theme = {
    ...existingTheme,
    "stylesheet.day.basic": {
      ...existingDayStyles,
      // Keep caller-provided colors and typography, but never allow a calendar
      // to move its day target away from the centre of its weekday column.
      base: { ...existingDayStyles.base, ...CENTERED_DAY_STYLES.base },
      selected: {
        ...existingDayStyles.selected,
        ...CENTERED_DAY_STYLES.selected,
      },
      today: { ...existingDayStyles.today, ...CENTERED_DAY_STYLES.today },
      text: { ...existingDayStyles.text, ...CENTERED_DAY_STYLES.text },
    },
  } as any;

  return <NativeCalendar {...props} theme={theme} />;
}

export { CenteredCalendar as Calendar };
export default CenteredCalendar;
