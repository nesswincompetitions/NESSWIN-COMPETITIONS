import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import { Upload, Image as ImageIcon, CheckCircle2, Clock, MapPin, Tag, Plus, Trash2, AlertCircle, Eye, X } from 'lucide-react';

const CreateCompetition = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  
  const [formData, setFormData] = useState({
    // Step 1: Details
    title: '',
    shortDescription: '',
    fullDescription: '',
    prizeName: '',
    prizeValue: '',
    category: 'Tech',
    isFeatured: false,
    images: [],
    imagePreviews: [],
    
    // Step 2: Pricing
    ticketPrice: '',
    maxTickets: '',
    sellOutBehavior: 'auto_end',
    
    // Step 3: Skill Question
    questionText: '',
    answers: [
      { text: '', isCorrect: true },
      { text: '', isCorrect: false },
      { text: '', isCorrect: false }
    ],

    // Step 4: Draw Settings
    drawEndDate: '',
    drawEndTime: '',
    autoEndDraw: true,
    instagramLiveLink: '',
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    
    // In a real app we'd upload these, for now just create previews
    const newPreviews = files.map(file => URL.createObjectURL(file));
    
    setFormData(prev => ({
      ...prev,
      images: [...(prev.images || []), ...files],
      imagePreviews: [...(prev.imagePreviews || []), ...newPreviews]
    }));
  };

  const removeImage = (index) => {
    setFormData(prev => {
      const newImages = [...(prev.images || [])];
      const newPreviews = [...(prev.imagePreviews || [])];
      
      if (newPreviews[index]) {
        URL.revokeObjectURL(newPreviews[index]);
      }
      
      newImages.splice(index, 1);
      newPreviews.splice(index, 1);
      
      return {
        ...prev,
        images: newImages,
        imagePreviews: newPreviews
      };
    });
  };

  const handleAnswerChange = (index, value) => {
    const newAnswers = [...formData.answers];
    newAnswers[index].text = value;
    setFormData(prev => ({ ...prev, answers: newAnswers }));
  };

  const setCorrectAnswer = (index) => {
    const newAnswers = formData.answers.map((ans, i) => ({
      ...ans,
      isCorrect: i === index
    }));
    setFormData(prev => ({ ...prev, answers: newAnswers }));
  };

  const addAnswer = () => {
    if (formData.answers.length < 4) {
      setFormData(prev => ({
        ...prev,
        answers: [...prev.answers, { text: '', isCorrect: false }]
      }));
    }
  };

  const removeAnswer = (index) => {
    if (formData.answers.length > 2) {
      const newAnswers = formData.answers.filter((_, i) => i !== index);
      if (formData.answers[index].isCorrect) {
        newAnswers[0].isCorrect = true;
      }
      setFormData(prev => ({ ...prev, answers: newAnswers }));
    }
  };

  const steps = ['Details', 'Pricing', 'Skill Question', 'Draw Settings', 'Review'];

  const handleNext = () => {
    if (currentStep < steps.length - 1) setCurrentStep(prev => prev + 1);
  };

  const handleBack = () => {
    if (currentStep > 0) setCurrentStep(prev => prev - 1);
  };

  const revenueEstimate = () => {
    const price = parseFloat(formData.ticketPrice) || 0;
    const tickets = parseInt(formData.maxTickets) || 0;
    return (price * tickets).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // -------------------------------------------------------------
  // RENDER STEPS
  // -------------------------------------------------------------

  const renderStep1 = () => (
    <Card>
      <div className="p-6 border-b border-white/10">
        <h2 className="text-lg font-semibold">Competition Details</h2>
        <p className="text-sm text-gray-400 mt-1">Basic information about the competition and the prize.</p>
      </div>
      <CardContent className="p-6 space-y-5">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Competition Title <span className="text-red-400">*</span></label>
          <input 
            type="text" name="title" value={formData.title} onChange={handleChange} placeholder="e.g. 2024 Range Rover Sport" maxLength={120}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 transition-colors"
          />
          <div className="text-xs text-gray-500 text-right">{formData.title.length}/120</div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Short Description</label>
          <input 
            type="text" name="shortDescription" value={formData.shortDescription} onChange={handleChange} placeholder="A brief catchy summary for the cards..." maxLength={200}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 transition-colors"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Full Description</label>
          <textarea 
            name="fullDescription" value={formData.fullDescription} onChange={handleChange} placeholder="Detailed information about the competition, specs, etc." rows={5}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 transition-colors resize-none"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Prize Name</label>
            <input 
              type="text" name="prizeName" value={formData.prizeName} onChange={handleChange} placeholder="e.g. Range Rover Sport V8"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Estimated Value (£)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">£</span>
              <input 
                type="number" name="prizeValue" value={formData.prizeValue} onChange={handleChange} placeholder="0.00"
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 transition-colors"
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Category</label>
          <select 
            name="category" value={formData.category} onChange={handleChange}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50 transition-colors appearance-none"
          >
            <option value="Tech" className="bg-[#0a0a0a]">Tech</option>
            <option value="Jewellery" className="bg-[#0a0a0a]">Jewellery</option>
            <option value="Fashion" className="bg-[#0a0a0a]">Fashion</option>
            <option value="Cars" className="bg-[#0a0a0a]">Cars</option>
            <option value="Experiences" className="bg-[#0a0a0a]">Experiences</option>
            <option value="Other" className="bg-[#0a0a0a]">Other</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Images</label>
          <label className="block border-2 border-dashed border-white/10 rounded-xl p-8 flex flex-col items-center justify-center gap-3 hover:bg-white/[0.02] transition-colors cursor-pointer group">
            <input type="file" multiple accept="image/*" className="hidden" onChange={handleImageUpload} />
            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Upload className="text-gray-400" size={24} />
            </div>
            <div className="text-center">
              <p className="text-sm text-white font-medium">Click to upload or drag and drop</p>
              <p className="text-xs text-gray-500 mt-1">SVG, PNG, JPG or GIF (max. 800x400px)</p>
            </div>
          </label>

          {formData.imagePreviews && formData.imagePreviews.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              {formData.imagePreviews.map((preview, idx) => (
                <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-white/10 group">
                  <img src={preview} alt={`Upload ${idx}`} className="w-full h-full object-cover" />
                  <button 
                    type="button"
                    onClick={(e) => { e.preventDefault(); removeImage(idx); }}
                    className="absolute top-1 right-1 bg-black/60 p-1 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
          <div>
            <p className="text-sm font-medium text-white">Featured Competition</p>
            <p className="text-xs text-gray-400 mt-0.5">Show this competition on the home page hero section.</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" name="isFeatured" checked={formData.isFeatured} onChange={handleChange} className="sr-only peer" />
            <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>
      </CardContent>
    </Card>
  );

  const renderStep2 = () => (
    <Card>
      <div className="p-6 border-b border-white/10">
        <h2 className="text-lg font-semibold">Pricing & Tickets</h2>
        <p className="text-sm text-gray-400 mt-1">Set the ticket price and maximum number of tickets available.</p>
      </div>
      <CardContent className="p-6 space-y-6">
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Ticket Price (£) <span className="text-red-400">*</span></label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">£</span>
              <input 
                type="number" name="ticketPrice" value={formData.ticketPrice} onChange={handleChange} placeholder="0.00"
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 transition-colors"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Maximum Tickets <span className="text-red-400">*</span></label>
            <input 
              type="number" name="maxTickets" value={formData.maxTickets} onChange={handleChange} placeholder="e.g. 5000"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>
        </div>

        <div className="p-4 bg-primary/10 border border-primary/20 rounded-xl flex gap-3 text-sm text-primary">
          <div className="mt-0.5">💰</div>
          <div>
            <p className="font-medium mb-1">Revenue Estimate</p>
            <p className="opacity-90">If all tickets sell: <span className="font-bold text-lg">£{revenueEstimate()}</span></p>
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-sm font-medium text-gray-300">Sell-out Behaviour</label>
          
          <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${formData.sellOutBehavior === 'auto_end' ? 'border-primary bg-primary/5' : 'border-white/10 bg-white/5'}`}>
            <div className="flex items-center h-5">
              <input type="radio" name="sellOutBehavior" value="auto_end" checked={formData.sellOutBehavior === 'auto_end'} onChange={handleChange} className="w-4 h-4 text-primary bg-white/10 border-white/20 focus:ring-primary focus:ring-2" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">Auto-end when sold out</p>
              <p className="text-xs text-gray-400 mt-1">The competition will automatically close and proceed to draw when all tickets are sold.</p>
            </div>
          </label>

          <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${formData.sellOutBehavior === 'keep_running' ? 'border-primary bg-primary/5' : 'border-white/10 bg-white/5'}`}>
            <div className="flex items-center h-5">
              <input type="radio" name="sellOutBehavior" value="keep_running" checked={formData.sellOutBehavior === 'keep_running'} onChange={handleChange} className="w-4 h-4 text-primary bg-white/10 border-white/20 focus:ring-primary focus:ring-2" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">Keep running till timer ends</p>
              <p className="text-xs text-gray-400 mt-1">The competition will remain open until the end date, even if sold out. (Useful for displaying "Sold Out" status).</p>
            </div>
          </label>
        </div>

      </CardContent>
    </Card>
  );

  const renderStep3 = () => (
    <Card>
      <div className="p-6 border-b border-white/10">
        <h2 className="text-lg font-semibold">Skill Question</h2>
        <p className="text-sm text-gray-400 mt-1">Users must answer this question correctly to enter the draw.</p>
      </div>
      <CardContent className="p-6 space-y-6">
        
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Question Text <span className="text-red-400">*</span></label>
          <input 
            type="text" name="questionText" value={formData.questionText} onChange={handleChange} placeholder="e.g. In what year was the first iPhone released?"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 transition-colors"
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-300">Answer Options (2-4)</label>
            <span className="text-xs text-gray-500">Select the radio button to mark the correct answer.</span>
          </div>
          
          <div className="space-y-3">
            {formData.answers.map((answer, index) => (
              <div key={index} className="flex items-center gap-3">
                <input 
                  type="radio" 
                  name="correctAnswer" 
                  checked={answer.isCorrect} 
                  onChange={() => setCorrectAnswer(index)}
                  className="w-4 h-4 text-primary bg-white/10 border-white/20 focus:ring-primary focus:ring-2 cursor-pointer" 
                  title="Mark as correct answer"
                />
                <input 
                  type="text" 
                  value={answer.text} 
                  onChange={(e) => handleAnswerChange(index, e.target.value)} 
                  placeholder={`Answer Option ${index + 1}`}
                  className={`flex-1 bg-white/5 border rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 transition-colors ${answer.isCorrect ? 'border-primary' : 'border-white/10'}`}
                />
                <button 
                  onClick={() => removeAnswer(index)} 
                  disabled={formData.answers.length <= 2}
                  className="p-2 text-gray-500 hover:text-red-400 disabled:opacity-50 disabled:hover:text-gray-500 transition-colors"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>

          {formData.answers.length < 4 && (
            <Button variant="outline" size="sm" onClick={addAnswer} className="mt-2 text-xs">
              <Plus size={14} className="mr-1" /> Add Option
            </Button>
          )}
        </div>

        <div className="mt-6 p-4 bg-white/5 border border-white/10 rounded-xl space-y-3">
          <h4 className="text-sm font-medium text-gray-400 flex items-center gap-2"><Eye size={14}/> Preview (User View)</h4>
          <p className="text-white font-medium">{formData.questionText || "Question text will appear here"}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {formData.answers.map((ans, i) => (
              <div key={i} className="p-3 border border-white/10 rounded-lg text-sm text-gray-300 text-center">
                {ans.text || `Option ${i + 1}`}
              </div>
            ))}
          </div>
        </div>

      </CardContent>
    </Card>
  );

  const renderStep4 = () => (
    <Card>
      <div className="p-6 border-b border-white/10">
        <h2 className="text-lg font-semibold">Draw Settings</h2>
        <p className="text-sm text-gray-400 mt-1">Configure when and how the draw will take place.</p>
      </div>
      <CardContent className="p-6 space-y-6">
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Draw End Date <span className="text-red-400">*</span></label>
            <input 
              type="date" name="drawEndDate" value={formData.drawEndDate} onChange={handleChange}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50 transition-colors [color-scheme:dark]"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Draw End Time <span className="text-red-400">*</span></label>
            <input 
              type="time" name="drawEndTime" value={formData.drawEndTime} onChange={handleChange}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50 transition-colors [color-scheme:dark]"
            />
          </div>
        </div>

        <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
          <div>
            <p className="text-sm font-medium text-white">Auto-end Draw</p>
            <p className="text-xs text-gray-400 mt-0.5">Automatically close entries at the specified date/time.</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" name="autoEndDraw" checked={formData.autoEndDraw} onChange={handleChange} className="sr-only peer" />
            <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Instagram Live Link (Optional)</label>
          <input 
            type="url" name="instagramLiveLink" value={formData.instagramLiveLink} onChange={handleChange} placeholder="https://instagram.com/..."
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 transition-colors"
          />
          <p className="text-xs text-gray-500">Provide a link if the draw will be broadcasted live.</p>
        </div>

      </CardContent>
    </Card>
  );

  const renderStep5 = () => (
    <Card>
      <div className="p-6 border-b border-white/10">
        <h2 className="text-lg font-semibold">Review & Publish</h2>
        <p className="text-sm text-gray-400 mt-1">Review all competition details before publishing.</p>
      </div>
      <CardContent className="p-6 space-y-8">
        
        {/* Validation Checklist (Dummy) */}
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex gap-3 text-sm text-emerald-400">
          <CheckCircle2 className="shrink-0 mt-0.5" size={18} />
          <div>
            <p className="font-medium">All required fields are completed</p>
            <p className="opacity-90 text-xs mt-0.5">The competition is ready to be published.</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Section 1 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <h3 className="text-sm font-medium text-white uppercase tracking-wider">Details</h3>
              <button onClick={() => setCurrentStep(0)} className="text-xs text-primary hover:underline">Edit</button>
            </div>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="text-gray-500">Title:</span>
              <span className="text-white font-medium text-right">{formData.title || '-'}</span>
              <span className="text-gray-500">Prize:</span>
              <span className="text-white text-right">{formData.prizeName || '-'}</span>
              <span className="text-gray-500">Value:</span>
              <span className="text-white text-right">£{formData.prizeValue || '0'}</span>
              <span className="text-gray-500">Category:</span>
              <span className="text-white text-right">{formData.category}</span>
            </div>
          </div>

          {/* Section 2 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <h3 className="text-sm font-medium text-white uppercase tracking-wider">Pricing</h3>
              <button onClick={() => setCurrentStep(1)} className="text-xs text-primary hover:underline">Edit</button>
            </div>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="text-gray-500">Ticket Price:</span>
              <span className="text-white font-medium text-right">£{formData.ticketPrice || '0'}</span>
              <span className="text-gray-500">Max Tickets:</span>
              <span className="text-white text-right">{formData.maxTickets || '0'}</span>
              <span className="text-gray-500">Sell-out:</span>
              <span className="text-white text-right">{formData.sellOutBehavior === 'auto_end' ? 'Auto-end' : 'Keep running'}</span>
            </div>
          </div>

          {/* Section 3 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <h3 className="text-sm font-medium text-white uppercase tracking-wider">Draw Settings</h3>
              <button onClick={() => setCurrentStep(3)} className="text-xs text-primary hover:underline">Edit</button>
            </div>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="text-gray-500">End Date:</span>
              <span className="text-white font-medium text-right">{formData.drawEndDate || '-'} at {formData.drawEndTime || '-'}</span>
              <span className="text-gray-500">Auto-end:</span>
              <span className="text-white text-right">{formData.autoEndDraw ? 'Yes' : 'No'}</span>
            </div>
          </div>
        </div>

      </CardContent>
    </Card>
  );

  // -------------------------------------------------------------
  // PREVIEW CARDS
  // -------------------------------------------------------------
  
  const renderLivePreview = () => (
    <div className="sticky top-6">
      <h3 className="text-sm font-medium text-gray-400 mb-3 uppercase tracking-wider">
        {currentStep === 3 ? 'Countdown Preview' : 'Live Preview'}
      </h3>
      
      <div className="bg-[#121212] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        <div className="aspect-[4/3] bg-white/5 flex items-center justify-center relative group">
          {formData.imagePreviews && formData.imagePreviews.length > 0 ? (
            <img src={formData.imagePreviews[0]} alt="Preview" className="w-full h-full object-cover" />
          ) : (
            <ImageIcon className="text-white/10" size={48} />
          )}
          {formData.isFeatured && (
            <div className="absolute top-3 left-3">
              <Badge variant="hot">Featured</Badge>
            </div>
          )}
        </div>
        
        <div className="p-5 space-y-4">
          <div>
            <h4 className="text-xl font-bold text-white line-clamp-2 leading-tight">
              {formData.title || "Competition Title Will Appear Here"}
            </h4>
            <p className="text-sm text-gray-400 mt-2 line-clamp-2">
              {formData.shortDescription || "Add a short description to give users a quick overview of what they can win."}
            </p>
          </div>

          {currentStep === 3 ? (
            <div className="pt-4 border-t border-white/5 text-center">
              <p className="text-xs text-gray-500 mb-2">Draw Ends In</p>
              <div className="flex justify-center gap-2">
                <div className="bg-white/5 px-3 py-2 rounded-lg"><span className="text-xl font-mono text-white">05</span><span className="text-[10px] text-gray-500 block">DAYS</span></div>
                <div className="bg-white/5 px-3 py-2 rounded-lg"><span className="text-xl font-mono text-white">12</span><span className="text-[10px] text-gray-500 block">HRS</span></div>
                <div className="bg-white/5 px-3 py-2 rounded-lg"><span className="text-xl font-mono text-white">45</span><span className="text-[10px] text-gray-500 block">MIN</span></div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between pt-4 border-t border-white/5">
              <div>
                <p className="text-xs text-gray-500">Ticket Price</p>
                <p className="text-lg font-bold text-primary mt-0.5">
                  {formData.ticketPrice ? `£${parseFloat(formData.ticketPrice).toLocaleString()}` : "£0.00"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">Value</p>
                <p className="text-sm font-medium text-white mt-1">£{formData.prizeValue ? parseFloat(formData.prizeValue).toLocaleString() : "0.00"}</p>
              </div>
            </div>
          )}
          
          <Button variant="primary" className="w-full mt-2 pointer-events-none opacity-80" size="sm">
            Enter Now
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6 fade-in pb-20">
      {/* Header & Stepper */}
      <div className="mb-8">
        <h1 className="text-3xl font-serif font-bold mb-6">Create Competition</h1>
        
        {/* Stepper */}
        <div className="flex items-center justify-between relative">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-0.5 bg-white/10 -z-10"></div>
          {steps.map((step, index) => {
            const isActive = index === currentStep;
            const isCompleted = index < currentStep;
            return (
              <div key={step} className="flex flex-col items-center gap-2 bg-[#0a0a0a] px-2 relative z-10">
                <button 
                  onClick={() => index < currentStep && setCurrentStep(index)}
                  disabled={index > currentStep}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium border-2 transition-colors ${
                    isActive 
                      ? 'border-primary bg-primary text-black' 
                      : isCompleted
                        ? 'border-emerald-400 bg-emerald-400/10 text-emerald-400 cursor-pointer hover:bg-emerald-400/20'
                        : 'border-white/20 bg-[#0a0a0a] text-gray-400'
                }`}>
                  {isCompleted ? <CheckCircle2 size={16} /> : index + 1}
                </button>
                <span className={`text-xs font-medium ${isActive ? 'text-primary' : isCompleted ? 'text-emerald-400' : 'text-gray-500'}`}>
                  {step}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* LEFT SIDE: Form (65%) */}
        <div className="lg:w-[65%] space-y-6">
          
          {currentStep === 0 && renderStep1()}
          {currentStep === 1 && renderStep2()}
          {currentStep === 2 && renderStep3()}
          {currentStep === 3 && renderStep4()}
          {currentStep === 4 && renderStep5()}
          
          <div className="flex items-center justify-between pt-4 border-t border-white/10 mt-6">
            <Button variant="outline" onClick={currentStep === 0 ? () => navigate('/admin/competitions') : handleBack}>
              {currentStep === 0 ? 'Cancel' : 'Back'}
            </Button>
            <div className="flex gap-3">
              <Button variant="outline">Save as Draft</Button>
              {currentStep === steps.length - 1 ? (
                <Button variant="primary" onClick={() => navigate('/admin/competitions')}>Publish Competition</Button>
              ) : (
                <Button variant="primary" onClick={handleNext}>Next Step: {steps[currentStep + 1]}</Button>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT SIDE: Preview (35%) */}
        <div className="lg:w-[35%] space-y-6 hidden lg:block">
          {renderLivePreview()}
        </div>
      </div>
    </div>
  );
};

export default CreateCompetition;
