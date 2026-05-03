# SmartCalc 🚀

A modern, minimal, and fully responsive calculator app built with Flutter. SmartCalc combines a clean user interface with robust mathematical logic and descriptive error handling to provide a seamless user experience.

## ✨ Features

-   **Modern & Minimal UI**: A clean design inspired by modern mobile interfaces.
-   **Fully Responsive**: The layout adapts perfectly to any screen size (Phones, Tablets) using dynamic scaling.
-   **Robust Logic**: Powered by `math_expressions` for accurate calculations and operator precedence.
-   **Descriptive Error Handling**: Instead of a generic "Error", SmartCalc tells you what went wrong (e.g., "Cannot divide by zero", "Invalid format").
-   **Auto-Evaluation**: See your result in real-time as you type your expression.
-   **Clean Architecture**: Organized into logical layers (Logic, Presentation, Controller) for better maintainability.
-   **Unit Tested**: Core logic is covered by comprehensive unit tests to ensure reliability.

## 🛠️ Tech Stack

-   **Framework**: [Flutter](https://flutter.dev/)
-   **State Management**: [Provider](https://pub.dev/packages/provider)
-   **Math Parsing**: [math_expressions](https://pub.dev/packages/math_expressions)
-   **Testing**: Flutter Unit Testing

## 📱 UI Layout

-   **Top Row Controls**: Quick access to `Clear (C)` and `Backspace (⌫)` above the number pad.
-   **Optimized Grid**: Large `0` button and a tall `+` button for ergonomic use.
-   **Smart Display**: Dynamic font scaling ensures that long expressions and error messages never overflow the screen.

## 🚀 Getting Started

### Prerequisites

-   Flutter SDK installed on your machine.
-   Android Studio / VS Code with Flutter extension.

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/abdelrahmant-9/SmartCalc.git
    ```

2.  **Navigate to the project directory:**
    ```bash
    cd SmartCalc
    ```

3.  **Install dependencies:**
    ```bash
    flutter pub get
    ```

4.  **Run the app:**
    ```bash
    flutter run
    ```

5.  **Run tests:**
    ```bash
    flutter test
    ```

## 🛡️ Error Handling

SmartCalc handles various edge cases gracefully:
-   **Division by zero**: Displays "Cannot divide by zero".
-   **Incomplete expressions**: Displays "Incomplete expression" (e.g., pressing `=` on `5+`).
-   **Invalid formats**: Catching sequences like `5++5` or `*5`.
-   **Auto-recovery**: Typing a new number after an error automatically clears the screen.

---
Built with ❤️ by [Abdelrahman](https://github.com/abdelrahmant-9)
