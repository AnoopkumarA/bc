
import React, { useState } from 'react';
import { GoogleGenAI } from '@google/genai';
import { ResumeContext } from '../types';

interface SetupFormProps {
  onComplete: (context: ResumeContext) => void;
}

const SetupForm: React.FC<SetupFormProps> = ({ onComplete }) => {
  const [form, setForm] = useState<ResumeContext>({
    jobTitle: '',
    company: '',
    resumeText: '',
    jobDescription: ''
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzing(true);
    
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      
      reader.onload = async () => {
        try {
            const base64Data = (reader.result as string).split(',')[1];
            const mimeType = file.type || 'application/pdf';
            
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: {
                    parts: [
                        {
                            inlineData: {
                                mimeType: mimeType,
                                data: base64Data
                            }
                        },
                        {
                            text: "Extract the text from this resume. Format it into a clean, structured plain text representation. Use uppercase for section headers (e.g., EXPERIENCE, EDUCATION), use dashes (-) for bullet points, and ensure there is clear vertical spacing between sections. Do not include markdown code blocks or conversational filler."
                        }
                    ]
                }
            });

            const extractedText = response.text;
            if (extractedText) {
                setForm(prev => ({ ...prev, resumeText: extractedText }));
            }
        } catch (error) {
            console.error("Error analyzing resume:", error);
            alert("Failed to extract text. Please ensure the file is a valid PDF or text document.");
        } finally {
            setIsAnalyzing(false);
        }
      };
      
      reader.onerror = () => {
        alert("Error reading file.");
        setIsAnalyzing(false);
      };

    } catch (error) {
      console.error(error);
      setIsAnalyzing(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onComplete(form);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-black text-white">
      <div className="w-full max-w-2xl bg-neutral-900/50 border border-white/10 rounded-2xl p-8 shadow-2xl backdrop-blur-xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            Interview Copilot
          </h1>
          <p className="text-neutral-400 mt-2">Configure your assistant context</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-300">Job Title</label>
              <input
                type="text"
                name="jobTitle"
                required
                value={form.jobTitle}
                onChange={handleChange}
                placeholder="e.g. Senior Frontend Engineer"
                className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-300">Company</label>
              <input
                type="text"
                name="company"
                required
                value={form.company}
                onChange={handleChange}
                placeholder="e.g. Google"
                className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-neutral-300">Resume Summary</label>
                <div className="relative">
                    <input
                        type="file"
                        id="resume-upload"
                        accept=".pdf,.txt,.rtf,.md,application/pdf,text/plain"
                        className="hidden"
                        onChange={handleFileUpload}
                        disabled={isAnalyzing}
                    />
                    <label
                        htmlFor="resume-upload"
                        className={`text-xs px-3 py-1.5 rounded cursor-pointer transition-colors flex items-center gap-2 border border-white/5 ${isAnalyzing ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed' : 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 hover:border-blue-500/30'}`}
                    >
                        {isAnalyzing ? (
                            <>
                                <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                Extracting...
                            </>
                        ) : (
                            <>
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                Upload PDF/Text
                            </>
                        )}
                    </label>
                </div>
            </div>
            <textarea
              name="resumeText"
              required
              value={form.resumeText}
              onChange={handleChange}
              placeholder="Paste your resume text here or upload a file..."
              rows={10}
              className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm font-mono text-xs leading-relaxed resize-y"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-300">Job Description</label>
            <textarea
              name="jobDescription"
              required
              value={form.jobDescription}
              onChange={handleChange}
              placeholder="Paste the job description here..."
              rows={5}
              className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm resize-none"
            />
          </div>

          <button
            type="submit"
            className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-all transform hover:scale-[1.01] active:scale-[0.99] shadow-lg shadow-blue-900/20"
          >
            Launch Assistant
          </button>
        </form>
      </div>
    </div>
  );
};

export default SetupForm;
