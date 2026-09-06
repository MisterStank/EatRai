import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { TopBar } from "./TopBar";

function renderBar(props: Partial<React.ComponentProps<typeof TopBar>> = {}) {
  const handlers = {
    onLocation: jest.fn(),
    onFilter: jest.fn(),
    onHelp: jest.fn(),
    onFeedback: jest.fn(),
    onSupport: jest.fn(),
  };
  const utils = render(
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <TopBar locationLabel="Near you" filterCount={0} {...handlers} {...props} />
    </SafeAreaProvider>,
  );
  return { ...utils, ...handlers };
}

describe("TopBar menu", () => {
  test("menu items are hidden until the menu button is tapped", () => {
    const { queryByText, getByLabelText } = renderBar();
    expect(queryByText("Give feedback / Report bugs")).toBeNull();

    fireEvent.press(getByLabelText("Menu"));

    expect(queryByText("How to use")).toBeTruthy();
    expect(queryByText("Give feedback / Report bugs")).toBeTruthy();
    expect(queryByText("Support the developer")).toBeTruthy();
  });

  test("tapping a row fires its handler and closes the menu", () => {
    const { getByLabelText, getByText, queryByText, onFeedback, onHelp } = renderBar();

    fireEvent.press(getByLabelText("Menu"));
    fireEvent.press(getByText("Give feedback / Report bugs"));

    expect(onFeedback).toHaveBeenCalledTimes(1);
    expect(onHelp).not.toHaveBeenCalled();
    expect(queryByText("Support the developer")).toBeNull();
  });

  test("How to use row opens the walkthrough", () => {
    const { getByLabelText, getByText, onHelp } = renderBar();

    fireEvent.press(getByLabelText("Menu"));
    fireEvent.press(getByText("How to use"));

    expect(onHelp).toHaveBeenCalledTimes(1);
  });
});
