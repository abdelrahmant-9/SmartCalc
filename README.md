# SmartCalc

SmartCalc is a professional-grade, minimal calculator application developed using the Flutter framework. It emphasizes clean architecture, responsive design across diverse device form factors, and robust mathematical evaluation logic.

## Core Features

- **Modern Minimalist UI**: Designed for clarity and ease of use, following contemporary interface standards.
- **Full Responsiveness**: Implements dynamic scaling to ensure a consistent user experience on smartphones and tablets.
- **Advanced Calculation Logic**: Utilizes the `math_expressions` library to ensure high precision and proper operator precedence.
- **Descriptive Error Feedback**: Replaces generic error messages with specific diagnostic feedback (e.g., "Cannot divide by zero", "Invalid format").
- **Real-time Auto-Evaluation**: Provides immediate results as mathematical expressions are entered.
- **Layered Architecture**: Adheres to Clean Architecture principles, separating logic, state management, and presentation layers for enhanced maintainability.
- **Comprehensive Unit Testing**: Core mathematical functions are validated through rigorous unit tests to ensure production-level reliability.

## Technical Stack

- **Framework**: Flutter
- **State Management**: Provider
- **Mathematical Parsing**: math_expressions
- **Testing Suite**: Flutter Test (Unit Testing)

## UI Layout and Ergonomics

- **Control Hierarchy**: Functional controls such as Clear (C) and Backspace are positioned prominently for efficient correction.
- **Optimized Input Grid**: Features an ergonomically placed large '0' button and a vertical '+' button to facilitate rapid data entry.
- **Dynamic Display**: Employs adaptive font scaling to prevent UI overflow during long expressions or detailed error messages.

## Installation and Setup

### Prerequisites

- Flutter SDK
- Android Studio / VS Code with Flutter extensions

### Setup Instructions

1. **Clone the repository:**
   ```bash
   git clone https://github.com/abdelrahmant-9/SmartCalc.git
   ```

2. **Navigate to the directory:**
   ```bash
   cd SmartCalc
   ```

3. **Retrieve dependencies:**
   ```bash
   flutter pub get
   ```

4. **Execute the application:**
   ```bash
   flutter run
   ```

5. **Execute tests:**
   ```bash
   flutter test
   ```

## Error Management Strategy

SmartCalc implements a proactive error management system to handle edge cases gracefully:
- **Division by Zero**: Explicitly identified and reported as "Cannot divide by zero".
- **Syntactical Validation**: Catches incomplete or invalid expressions (e.g., trailing operators or consecutive invalid symbols).
- **Auto-State Reset**: Automatically clears the error state upon new numeric input to maintain workflow continuity.

---
Developed by [Abdelrahman](https://github.com/abdelrahmant-9)
