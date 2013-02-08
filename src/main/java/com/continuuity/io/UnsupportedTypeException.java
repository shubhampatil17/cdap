package com.continuuity.io;

/**
 * Exception to indicate a given type is not supported.
 */
public class UnsupportedTypeException extends Exception {
  public UnsupportedTypeException(String message) {
    super(message);
  }

  public UnsupportedTypeException(String message, Throwable cause) {
    super(message, cause);
  }

  public UnsupportedTypeException(Throwable cause) {
    super(cause);
  }
}
