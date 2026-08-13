import React from 'react';
import { RotateCcw, ShieldAlert } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-stone-900 text-stone-100 flex items-center justify-center p-4 font-['Cairo',sans-serif]">
          <div className="bg-stone-800 border-2 border-amber-500/50 rounded-3xl p-6 max-w-md w-full shadow-2xl text-center space-y-4">
            <div className="w-16 h-16 bg-amber-500/20 text-amber-400 rounded-2xl flex items-center justify-center mx-auto border border-amber-500/30">
              <ShieldAlert className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h2 className="text-xl font-black text-amber-300">حدث خطأ بسيط في العرض</h2>
              <p className="text-xs text-stone-300">
                تم حماية التطبيق ومنع الشاشة البيضاء بنجاح! يمكن إعادة التحميل فوراً لتحديث البيانات.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-stone-950/80 p-3 rounded-xl text-right dir-ltr text-[11px] font-mono text-red-300 overflow-x-auto border border-stone-700">
                {this.state.error.message}
              </div>
            )}

            <button
              onClick={this.handleReset}
              className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-stone-950 font-black text-xs rounded-2xl shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2 active:scale-95"
            >
              <RotateCcw className="w-4 h-4" />
              <span>إعادة تحميل الشاشة</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
