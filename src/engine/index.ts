/**
 * The pure core of the reading trainer.
 *
 * Nothing in this folder may import React, the DOM, the network or storage.
 * Everything here is a function of its arguments, which is why it can all be
 * tested in a node environment without a single mock — and why the same code
 * can run during a quiz, during a replay and inside a test.
 */
export * from "./types.ts";
export * from "./rng.ts";
export * from "./timing.ts";
export * from "./scoring.ts";
export * from "./level.ts";
export * from "./mastery.ts";
export * from "./sentences.ts";
export * from "./textStats.ts";
export * from "./reading.ts";
export * from "./normalize.ts";
export * from "./distance.ts";
export * from "./stem.ts";
export * from "./stopwords.ts";
export * from "./grade.ts";
export * from "./align.ts";
export * from "./fallbackQuestions.ts";
export * from "./warmup.ts";
