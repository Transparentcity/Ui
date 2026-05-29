import { describe, it, expect } from "vitest";
import { SIGNUP_AUTHORIZATION_PARAMS } from "./signup";

describe("SIGNUP_AUTHORIZATION_PARAMS", () => {
  it("includes params for New and Classic Auth0 signup flows", () => {
    expect(SIGNUP_AUTHORIZATION_PARAMS).toEqual({
      screen_hint: "signup",
      prompt: "login",
      action: "signup",
    });
  });
});
