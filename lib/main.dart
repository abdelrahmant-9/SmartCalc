import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'features/calculator/presentation/controller/calculator_controller.dart';
import 'features/calculator/presentation/screens/calculator_screen.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => CalculatorController()),
      ],
      child: MaterialApp(
        title: 'Smart Calc',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: Colors.orange),
          useMaterial3: true,
          fontFamily: 'Roboto', // Defaulting to Roboto, common in Flutter
        ),
        home: const CalculatorScreen(),
      ),
    );
  }
}
