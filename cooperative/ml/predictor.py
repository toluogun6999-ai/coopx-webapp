"""
CoopSys Machine Learning Module
================================
Implements loan default prediction using Random Forest Classifier.
Also provides Logistic Regression and Decision Tree for comparison.

Author: CoopSys Development Team
"""

import os
import numpy as np
import pandas as pd
import joblib
from pathlib import Path
from datetime import datetime

from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score,
    f1_score, roc_auc_score, classification_report,
    confusion_matrix
)
from sklearn.pipeline import Pipeline

# ─── PATH CONFIGURATION ──────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
MODELS_DIR = BASE_DIR / 'models'
MODELS_DIR.mkdir(exist_ok=True)

MODEL_PATH = MODELS_DIR / 'random_forest_model.joblib'
SCALER_PATH = MODELS_DIR / 'scaler.joblib'
METRICS_PATH = MODELS_DIR / 'model_metrics.joblib'

# ─── FEATURE DEFINITIONS ─────────────────────────────────────────────────────
FEATURE_NAMES = [
    'savings_balance',
    'loan_amount',
    'loan_amount_to_savings_ratio',
    'months_as_member',
    'previous_defaults',
    'contribution_consistency',        # 0-1 ratio of months paid
    'debt_to_savings_ratio',
    'repayment_history_score',         # 0-100
    'monthly_income',
    'tenure_months',
]

FEATURE_LABELS = {
    'savings_balance': 'Savings Balance',
    'loan_amount': 'Loan Amount Requested',
    'loan_amount_to_savings_ratio': 'Loan-to-Savings Ratio',
    'months_as_member': 'Membership Duration (months)',
    'previous_defaults': 'Previous Defaults',
    'contribution_consistency': 'Contribution Consistency',
    'debt_to_savings_ratio': 'Debt-to-Savings Ratio',
    'repayment_history_score': 'Repayment History Score',
    'monthly_income': 'Monthly Income',
    'tenure_months': 'Requested Loan Tenure',
}

RISK_LABELS = {0: 'Low', 1: 'Medium', 2: 'High'}
RISK_COLORS = {'Low': 'success', 'Medium': 'warning', 'High': 'danger'}
RISK_THRESHOLDS = {'Low': 0.33, 'Medium': 0.66}


# ─── SYNTHETIC DATA GENERATOR ────────────────────────────────────────────────

def generate_training_data(n_samples: int = 1200) -> pd.DataFrame:
    """
    Generate realistic synthetic training data for cooperative loan default prediction.
    Mimics real-world cooperative member financial behavior.
    """
    np.random.seed(42)

    # Good members: high savings, consistent contributions, good history
    n_low = n_samples // 3
    # Medium risk members
    n_medium = n_samples // 3
    # High risk members
    n_high = n_samples - n_low - n_medium

    def make_low_risk(n):
        return {
            'savings_balance': np.random.uniform(80000, 1200000, n),
            'loan_amount': np.random.uniform(20000, 300000, n),
            'months_as_member': np.random.randint(12, 72, n),
            'previous_defaults': np.random.choice([0, 1], n, p=[0.95, 0.05]),
            'contribution_consistency': np.random.uniform(0.80, 1.0, n),
            'monthly_income': np.random.uniform(80000, 500000, n),
            'tenure_months': np.random.randint(6, 36, n),
            'repayment_history_score': np.random.uniform(75, 100, n),
            'default': np.zeros(n, dtype=int),
        }

    def make_medium_risk(n):
        return {
            'savings_balance': np.random.uniform(30000, 150000, n),
            'loan_amount': np.random.uniform(50000, 250000, n),
            'months_as_member': np.random.randint(4, 30, n),
            'previous_defaults': np.random.choice([0, 1, 2], n, p=[0.60, 0.30, 0.10]),
            'contribution_consistency': np.random.uniform(0.50, 0.80, n),
            'monthly_income': np.random.uniform(40000, 150000, n),
            'tenure_months': np.random.randint(12, 48, n),
            'repayment_history_score': np.random.uniform(45, 75, n),
            'default': np.ones(n, dtype=int),
        }

    def make_high_risk(n):
        return {
            'savings_balance': np.random.uniform(5000, 60000, n),
            'loan_amount': np.random.uniform(80000, 500000, n),
            'months_as_member': np.random.randint(1, 12, n),
            'previous_defaults': np.random.choice([0, 1, 2, 3], n, p=[0.20, 0.35, 0.30, 0.15]),
            'contribution_consistency': np.random.uniform(0.10, 0.55, n),
            'monthly_income': np.random.uniform(15000, 80000, n),
            'tenure_months': np.random.randint(24, 60, n),
            'repayment_history_score': np.random.uniform(10, 50, n),
            'default': np.full(n, 2, dtype=int),
        }

    frames = []
    for fn in [make_low_risk, make_medium_risk, make_high_risk]:
        d = fn(n_low if fn == make_low_risk else n_medium if fn == make_medium_risk else n_high)
        df = pd.DataFrame(d)
        frames.append(df)

    data = pd.concat(frames, ignore_index=True)
    data = data.sample(frac=1, random_state=42).reset_index(drop=True)

    # Compute derived features
    data['loan_amount_to_savings_ratio'] = data['loan_amount'] / (data['savings_balance'] + 1)
    data['debt_to_savings_ratio'] = (
        data['loan_amount'] / (data['monthly_income'] * data['tenure_months'] + 1)
    )
    return data


# ─── MODEL TRAINING ──────────────────────────────────────────────────────────

def train_model(n_samples: int = 1200):
    """
    Train Random Forest classifier on synthetic cooperative data.
    Saves model, scaler, and evaluation metrics.
    Returns evaluation report dict.
    """
    data = generate_training_data(n_samples)

    X = data[FEATURE_NAMES]
    y = data['default']

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    # ─── Random Forest ───
    rf = RandomForestClassifier(
        n_estimators=150,
        max_depth=10,
        min_samples_split=5,
        min_samples_leaf=2,
        class_weight='balanced',
        random_state=42,
        n_jobs=-1
    )
    rf.fit(X_train_scaled, y_train)
    rf_preds = rf.predict(X_test_scaled)
    rf_proba = rf.predict_proba(X_test_scaled)

    # Feature importances
    importances = dict(zip(FEATURE_NAMES, rf.feature_importances_.tolist()))
    sorted_importances = dict(sorted(importances.items(), key=lambda x: x[1], reverse=True))

    # Cross-validation
    cv_scores = cross_val_score(rf, X_train_scaled, y_train, cv=5, scoring='accuracy')

    metrics = {
        'accuracy': round(accuracy_score(y_test, rf_preds) * 100, 2),
        'precision': round(precision_score(y_test, rf_preds, average='weighted') * 100, 2),
        'recall': round(recall_score(y_test, rf_preds, average='weighted') * 100, 2),
        'f1_score': round(f1_score(y_test, rf_preds, average='weighted') * 100, 2),
        'cv_mean': round(cv_scores.mean() * 100, 2),
        'cv_std': round(cv_scores.std() * 100, 2),
        'feature_importances': sorted_importances,
        'feature_labels': FEATURE_LABELS,
        'n_samples': n_samples,
        'train_size': len(X_train),
        'test_size': len(X_test),
        'trained_at': datetime.now().isoformat(),
        'algorithm': 'Random Forest Classifier',
        'confusion_matrix': confusion_matrix(y_test, rf_preds).tolist(),
        'classification_report': classification_report(y_test, rf_preds, output_dict=True),
    }

    # Save model and scaler
    joblib.dump(rf, MODEL_PATH)
    joblib.dump(scaler, SCALER_PATH)
    joblib.dump(metrics, METRICS_PATH)

    return metrics


# ─── PREDICTION ──────────────────────────────────────────────────────────────

def predict_default_risk(features: dict) -> dict:
    """
    Predict loan default risk for a member.

    Args:
        features: dict with keys matching FEATURE_NAMES

    Returns:
        dict with risk_level, default_probability, confidence, feature_importances
    """
    # Auto-train if model doesn't exist
    if not MODEL_PATH.exists():
        train_model()

    model = joblib.load(MODEL_PATH)
    scaler = joblib.load(SCALER_PATH)
    metrics_data = joblib.load(METRICS_PATH) if METRICS_PATH.exists() else {}

    # Build feature vector
    savings = float(features.get('savings_balance', 0))
    loan_amount = float(features.get('loan_amount', 0))
    monthly_income = float(features.get('monthly_income', 0))
    tenure_months = int(features.get('tenure_months', 12))

    feature_vector = [
        savings,
        loan_amount,
        loan_amount / (savings + 1),
        int(features.get('months_as_member', 1)),
        int(features.get('previous_defaults', 0)),
        float(features.get('contribution_consistency', 0.5)),
        loan_amount / (monthly_income * tenure_months + 1),
        float(features.get('repayment_history_score', 50)),
        monthly_income,
        tenure_months,
    ]

    X = np.array(feature_vector).reshape(1, -1)
    X_scaled = scaler.transform(X)

    pred_class = model.predict(X_scaled)[0]
    pred_proba = model.predict_proba(X_scaled)[0]

    risk_level = RISK_LABELS[pred_class]
    default_probability = float(pred_proba[pred_class])

    # Build feature importance context
    fi = metrics_data.get('feature_importances', {})
    feature_analysis = []
    for fname, fval in zip(FEATURE_NAMES, feature_vector):
        feature_analysis.append({
            'name': FEATURE_LABELS.get(fname, fname),
            'key': fname,
            'value': round(fval, 4),
            'importance': round(fi.get(fname, 0) * 100, 1),
        })
    feature_analysis.sort(key=lambda x: x['importance'], reverse=True)

    return {
        'risk_level': risk_level,
        'default_probability': round(default_probability * 100, 1),
        'probabilities': {
            'Low': round(float(pred_proba[0]) * 100, 1),
            'Medium': round(float(pred_proba[1]) * 100, 1),
            'High': round(float(pred_proba[2]) * 100, 1),
        },
        'risk_color': RISK_COLORS[risk_level],
        'feature_analysis': feature_analysis,
        'recommendation': _get_recommendation(risk_level, feature_analysis),
        'confidence': round(default_probability * 100, 1),
    }


def _get_recommendation(risk_level: str, features: list) -> str:
    """Generate human-readable recommendation based on risk level."""
    if risk_level == 'Low':
        return (
            "This member demonstrates excellent financial behavior. "
            "Loan approval is recommended. Maintain standard monitoring."
        )
    elif risk_level == 'Medium':
        return (
            "Moderate risk detected. Consider approving with reduced loan amount "
            "or additional guarantor requirements. Increase repayment monitoring frequency."
        )
    else:
        return (
            "High default probability detected. Loan approval is NOT recommended at this time. "
            "Advise the member to build savings consistency over at least 3 more months "
            "before re-application."
        )


def get_model_metrics() -> dict:
    """Load and return saved model performance metrics."""
    if not METRICS_PATH.exists():
        return train_model()
    return joblib.load(METRICS_PATH)


def is_model_trained() -> bool:
    """Check if the ML model has been trained and saved."""
    return MODEL_PATH.exists() and SCALER_PATH.exists()
