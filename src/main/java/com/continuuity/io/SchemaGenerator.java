package com.continuuity.io;

import java.lang.reflect.Type;

/**
 * Interface for generating data {@link Schema}.
 */
public interface SchemaGenerator {

  /**
   * Generate a {@link Schema} for the given java {@link Type}.
   *
   * @param type The java {@link Type} for generating a {@link Schema}.
   * @return A {@link Schema} representing the given java {@link Type}.
   * @throws UnsupportedTypeException Indicates schema generation is not support for the given java {@link Type}.
   */
  Schema generate(Type type) throws UnsupportedTypeException;
}
