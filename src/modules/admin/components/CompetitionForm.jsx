import React, { useState } from 'react';
import { Card, CardContent } from '../../../components/ui/Card';
import { useTranslation } from 'react-i18next';
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import { Upload, Image as ImageIcon, CheckCircle2, Clock, MapPin, Tag, Plus, Trash2, AlertCircle, Eye, X } from 'lucide-react';
import { toast } from 'react-hot-toast';

const CompetitionForm = ({ isEditMode = false, initialData = null, onCancel, onSaveDraft, onSubmit }) => {
  const { t } = useTranslation('admin');
  const [currentStep, setCurrentStep] = useState(0);
  
  const [formData, setFormData] = useState(initialData || {
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
    questionImages: [],
    questionImagePreviews: [],
    answers: [
      { text: '', isCorrect: true },
      { text: '', isCorrect: false },
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

  const handleQuestionImageUpload = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    
    const newPreviews = files.map(file => URL.createObjectURL(file));
    
    setFormData(prev => ({
      ...prev,
      questionImages: [...(prev.questionImages || []), ...files],
      questionImagePreviews: [...(prev.questionImagePreviews || []), ...newPreviews]
    }));
  };

  const removeQuestionImage = (index) => {
    setFormData(prev => {
      const newImages = [...(prev.questionImages || [])];
      const newPreviews = [...(prev.questionImagePreviews || [])];
      
      if (newPreviews[index]) {
        URL.revokeObjectURL(newPreviews[index]);
      }
      
      newImages.splice(index, 1);
      newPreviews.splice(index, 1);
      
      return {
        ...prev,
        questionImages: newImages,
        questionImagePreviews: newPreviews
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

  const steps = [
    t('competitions.form.steps.details'),
    t('competitions.form.steps.pricing'),
    t('competitions.form.steps.skillQuestion'),
    t('competitions.form.steps.drawSettings'),
    t('competitions.form.steps.review')
  ];

  const handleNext = () => {
    // Validation for Step 2: Skill Question
    if (currentStep === 2) {
      if (!formData.questionImagePreviews || formData.questionImagePreviews.length === 0) {
        toast.error(t('competitions.form.step3.imageRequiredToast'));
        return;
      }
      if (!formData.questionText.trim()) {
        toast.error(t('competitions.form.step3.questionRequiredToast'));
        return;
      }
    }

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

  const renderStep1 = () => (
    <Card>
      <div className="p-6 border-b border-white/10">
        <h2 className="text-lg font-semibold">{t('competitions.form.step1.title')}</h2>
        <p className="text-sm text-gray-400 mt-1">{t('competitions.form.step1.subtitle')}</p>
      </div>
      <CardContent className="p-6 space-y-5">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">{t('competitions.form.step1.competitionTitle')} <span className="text-red-400">*</span></label>
          <input 
            type="text" name="title" value={formData.title} onChange={handleChange} placeholder={t('competitions.form.step1.titlePlaceholder')} maxLength={120}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 transition-colors"
          />
          <div className="text-xs text-gray-500 text-right">{formData.title.length}/120</div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">{t('competitions.form.step1.shortDescription')}</label>
          <input 
            type="text" name="shortDescription" value={formData.shortDescription} onChange={handleChange} placeholder={t('competitions.form.step1.shortDescPlaceholder')} maxLength={200}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 transition-colors"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">{t('competitions.form.step1.fullDescription')}</label>
          <textarea 
            name="fullDescription" value={formData.fullDescription} onChange={handleChange} placeholder={t('competitions.form.step1.fullDescPlaceholder')} rows={5}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 transition-colors resize-none"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">{t('competitions.form.step1.prizeName')}</label>
            <input 
              type="text" name="prizeName" value={formData.prizeName} onChange={handleChange} placeholder={t('competitions.form.step1.prizeNamePlaceholder')}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">{t('competitions.form.step1.estimatedValue')}</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">£</span>
              <input 
                type="number" name="prizeValue" value={formData.prizeValue} onChange={handleChange} placeholder={t('competitions.form.step1.estimatedValuePlaceholder')}
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 transition-colors"
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">{t('competitions.form.step1.category')}</label>
          <select 
            name="category" value={formData.category} onChange={handleChange}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50 transition-colors appearance-none"
          >
            <option value="Tech" className="bg-[#0a0a0a]">{t('competitions.form.step1.categories.tech')}</option>
            <option value="Jewellery" className="bg-[#0a0a0a]">{t('competitions.form.step1.categories.jewellery')}</option>
            <option value="Fashion" className="bg-[#0a0a0a]">{t('competitions.form.step1.categories.fashion')}</option>
            <option value="Cars" className="bg-[#0a0a0a]">{t('competitions.form.step1.categories.cars')}</option>
            <option value="Experiences" className="bg-[#0a0a0a]">{t('competitions.form.step1.categories.experiences')}</option>
            <option value="Other" className="bg-[#0a0a0a]">{t('competitions.form.step1.categories.other')}</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">{t('competitions.form.step1.images')}</label>
          <label className="block border-2 border-dashed border-white/10 rounded-xl p-8 flex flex-col items-center justify-center gap-3 hover:bg-white/[0.02] transition-colors cursor-pointer group">
            <input type="file" multiple accept="image/*" className="hidden" onChange={handleImageUpload} />
            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Upload className="text-gray-400" size={24} />
            </div>
            <div className="text-center">
              <p className="text-sm text-white font-medium">{t('competitions.form.step1.uploadText')}</p>
              <p className="text-xs text-gray-500 mt-1">{t('competitions.form.step1.uploadHint')}</p>
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
            <p className="text-sm font-medium text-white">{t('admin.competitions.form.step1.featuredCompetition')}</p>
            <p className="text-xs text-gray-400 mt-0.5">{t('admin.competitions.form.step1.featuredDesc')}</p>
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
        <h2 className="text-lg font-semibold">{t('admin.competitions.form.step2.title')}</h2>
        <p className="text-sm text-gray-400 mt-1">{t('admin.competitions.form.step2.subtitle')}</p>
      </div>
      <CardContent className="p-6 space-y-6">
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">{t('admin.competitions.form.step2.ticketPrice')} <span className="text-red-400">*</span></label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">£</span>
              <input 
                type="number" name="ticketPrice" value={formData.ticketPrice} onChange={handleChange} placeholder={t('admin.competitions.form.step2.ticketPricePlaceholder')}
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 transition-colors"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">{t('admin.competitions.form.step2.maxTickets')} <span className="text-red-400">*</span></label>
            <input 
              type="number" name="maxTickets" value={formData.maxTickets} onChange={handleChange} placeholder={t('admin.competitions.form.step2.maxTicketsPlaceholder')}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>
        </div>

        <div className="p-4 bg-primary/10 border border-primary/20 rounded-xl flex gap-3 text-sm text-primary">
          <div className="mt-0.5">💰</div>
          <div>
            <p className="font-medium mb-1">{t('admin.competitions.form.step2.revenueEstimate')}</p>
            <p className="opacity-90">{t('admin.competitions.form.step2.ifAllSell')} <span className="font-bold text-lg">£{revenueEstimate()}</span></p>
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-sm font-medium text-gray-300">{t('admin.competitions.form.step2.sellOutBehavior')}</label>
          
          <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${formData.sellOutBehavior === 'auto_end' ? 'border-primary bg-primary/5' : 'border-white/10 bg-white/5'}`}>
            <div className="flex items-center h-5">
              <input type="radio" name="sellOutBehavior" value="auto_end" checked={formData.sellOutBehavior === 'auto_end'} onChange={handleChange} className="w-4 h-4 text-primary bg-white/10 border-white/20 focus:ring-primary focus:ring-2" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">{t('admin.competitions.form.step2.autoEndLabel')}</p>
              <p className="text-xs text-gray-400 mt-1">{t('admin.competitions.form.step2.autoEndDesc')}</p>
            </div>
          </label>

          <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${formData.sellOutBehavior === 'keep_running' ? 'border-primary bg-primary/5' : 'border-white/10 bg-white/5'}`}>
            <div className="flex items-center h-5">
              <input type="radio" name="sellOutBehavior" value="keep_running" checked={formData.sellOutBehavior === 'keep_running'} onChange={handleChange} className="w-4 h-4 text-primary bg-white/10 border-white/20 focus:ring-primary focus:ring-2" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">{t('admin.competitions.form.step2.keepRunningLabel')}</p>
              <p className="text-xs text-gray-400 mt-1">{t('admin.competitions.form.step2.keepRunningDesc')}</p>
            </div>
          </label>
        </div>

      </CardContent>
    </Card>
  );

  const renderStep3 = () => (
    <Card>
      <div className="p-6 border-b border-white/10">
        <h2 className="text-lg font-semibold">{t('admin.competitions.form.step3.title')}</h2>
        <p className="text-sm text-gray-400 mt-1">{t('admin.competitions.form.step3.subtitle')}</p>
      </div>
      <CardContent className="p-6 space-y-6">
        
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">{t('admin.competitions.form.step3.questionText')} <span className="text-red-400">*</span></label>
          <input 
            type="text" name="questionText" value={formData.questionText} onChange={handleChange} placeholder={t('admin.competitions.form.step3.questionTextPlaceholder')}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 transition-colors"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">{t('admin.competitions.form.step3.questionImages')} <span className="text-red-400">*</span> {t('admin.competitions.form.step3.questionImagesMin')}</label>
          <label className="block border-2 border-dashed border-white/10 rounded-xl p-6 flex flex-col items-center justify-center gap-2 hover:bg-white/[0.02] transition-colors cursor-pointer group">
            <input type="file" multiple accept="image/*" className="hidden" onChange={handleQuestionImageUpload} />
            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Upload className="text-gray-400" size={20} />
            </div>
            <p className="text-sm text-white font-medium mt-1">{t('admin.competitions.form.step3.uploadQuestionImages')}</p>
          </label>

          {formData.questionImagePreviews && formData.questionImagePreviews.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              {formData.questionImagePreviews.map((preview, idx) => (
                <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-white/10 group">
                  <img src={preview} alt={`Question ${idx}`} className="w-full h-full object-cover" />
                  <button 
                    type="button"
                    onClick={(e) => { e.preventDefault(); removeQuestionImage(idx); }}
                    className="absolute top-1 right-1 bg-black/60 p-1 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          
          {(!formData.questionImagePreviews || formData.questionImagePreviews.length === 0) && currentStep === 2 && (
            <p className="text-xs text-red-400 flex items-center gap-1 mt-2">
              <AlertCircle size={12} /> {t('competitions.form.step3.imageRequired')}
            </p>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-300">{t('competitions.form.step3.answerOptions')}</label>
            <span className="text-xs text-gray-500">{t('competitions.form.step3.answerHint')}</span>
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
                  title={t('competitions.form.step3.markCorrect')}
                />
                <input 
                  type="text" 
                  value={answer.text} 
                  onChange={(e) => handleAnswerChange(index, e.target.value)} 
                  placeholder={`${t('competitions.form.step3.answerPlaceholder')} ${index + 1}`}
                  className={`flex-1 bg-white/5 border rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 transition-colors ${answer.isCorrect ? 'border-primary' : 'border-white/10'}`}
                />
                <button 
                  type="button"
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
              <Plus size={14} className="mr-1" /> {t('competitions.form.step3.addOption')}
            </Button>
          )}
        </div>

        <div className="mt-6 p-4 bg-white/5 border border-white/10 rounded-xl space-y-3">
          <h4 className="text-sm font-medium text-gray-400 flex items-center gap-2"><Eye size={14}/> {t('competitions.form.step3.preview')}</h4>
          {formData.questionImagePreviews && formData.questionImagePreviews.length > 0 && (
            <div className={`mx-auto ${formData.questionImagePreviews.length === 1 ? 'max-w-sm' : 'max-w-sm grid grid-cols-2 gap-2'}`}>
              {formData.questionImagePreviews.map((preview, idx) => (
                <div 
                  key={idx} 
                  className={`rounded-lg overflow-hidden border border-white/5 ${
                    formData.questionImagePreviews.length === 1 ? 'aspect-video w-full' : 'aspect-square'
                  }`}
                >
                  <img src={preview} alt={`Question Preview ${idx}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          )}
          <p className="text-white font-medium text-center">{formData.questionText || t('competitions.form.step3.questionPreviewPlaceholder')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {formData.answers.map((ans, i) => (
              <div key={i} className="p-3 border border-white/10 rounded-lg text-sm text-gray-300 text-center">
                {ans.text || `${t('competitions.form.step3.option')} ${i + 1}`}
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
        <h2 className="text-lg font-semibold">{t('competitions.form.step4.title')}</h2>
        <p className="text-sm text-gray-400 mt-1">{t('competitions.form.step4.subtitle')}</p>
      </div>
      <CardContent className="p-6 space-y-6">
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">{t('competitions.form.step4.drawEndDate')} <span className="text-red-400">*</span></label>
            <input 
              type="date" name="drawEndDate" value={formData.drawEndDate} onChange={handleChange}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50 transition-colors [color-scheme:dark]"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">{t('competitions.form.step4.drawEndTime')} <span className="text-red-400">*</span></label>
            <input 
              type="time" name="drawEndTime" value={formData.drawEndTime} onChange={handleChange}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50 transition-colors [color-scheme:dark]"
            />
          </div>
        </div>

        <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
          <div>
            <p className="text-sm font-medium text-white">{t('competitions.form.step4.autoEndDraw')}</p>
            <p className="text-xs text-gray-400 mt-0.5">{t('competitions.form.step4.autoEndDrawDesc')}</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" name="autoEndDraw" checked={formData.autoEndDraw} onChange={handleChange} className="sr-only peer" />
            <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">{t('competitions.form.step4.instagramLink')}</label>
          <input 
            type="url" name="instagramLiveLink" value={formData.instagramLiveLink} onChange={handleChange} placeholder={t('competitions.form.step4.instagramPlaceholder')}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50 transition-colors"
          />
          <p className="text-xs text-gray-500">{t('competitions.form.step4.instagramHint')}</p>
        </div>

      </CardContent>
    </Card>
  );

  const renderStep5 = () => (
    <Card>
      <div className="p-6 border-b border-white/10">
        <h2 className="text-lg font-semibold">{t(isEditMode ? 'competitions.form.step5.titleSave' : 'competitions.form.step5.titlePublish')}</h2>
        <p className="text-sm text-gray-400 mt-1">{t(isEditMode ? 'competitions.form.step5.subtitleSave' : 'competitions.form.step5.subtitlePublish')}</p>
      </div>
      <CardContent className="p-6 space-y-8">
        
        {/* Validation Checklist (Dummy) */}
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex gap-3 text-sm text-emerald-400">
          <CheckCircle2 className="shrink-0 mt-0.5" size={18} />
          <div>
            <p className="font-medium">{t('competitions.form.step5.allComplete')}</p>
            <p className="opacity-90 text-xs mt-0.5">{t(isEditMode ? 'competitions.form.step5.readyUpdate' : 'competitions.form.step5.readyPublish')}</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Section 1 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <h3 className="text-sm font-medium text-white uppercase tracking-wider">{t('competitions.form.step5.details')}</h3>
              <button type="button" onClick={() => setCurrentStep(0)} className="text-xs text-primary hover:underline">{t('common.edit')}</button>
            </div>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="text-gray-500">{t('competitions.form.step5.title')}</span>
              <span className="text-white font-medium text-right">{formData.title || '-'}</span>
              <span className="text-gray-500">{t('competitions.form.step5.prize')}</span>
              <span className="text-white text-right">{formData.prizeName || '-'}</span>
              <span className="text-gray-500">{t('competitions.form.step5.value')}</span>
              <span className="text-white text-right">£{formData.prizeValue || '0'}</span>
              <span className="text-gray-500">{t('competitions.form.step5.category')}</span>
              <span className="text-white text-right">{formData.category}</span>
            </div>
          </div>

          {/* Section 2 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <h3 className="text-sm font-medium text-white uppercase tracking-wider">{t('competitions.form.step5.pricing')}</h3>
              <button type="button" onClick={() => setCurrentStep(1)} className="text-xs text-primary hover:underline">{t('common.edit')}</button>
            </div>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="text-gray-500">{t('competitions.form.step5.ticketPrice')}</span>
              <span className="text-white font-medium text-right">£{formData.ticketPrice || '0'}</span>
              <span className="text-gray-500">{t('competitions.form.step5.maxTickets')}</span>
              <span className="text-white text-right">{formData.maxTickets || '0'}</span>
              <span className="text-gray-500">{t('competitions.form.step5.sellOut')}</span>
              <span className="text-white text-right">{formData.sellOutBehavior === 'auto_end' ? t('competitions.form.step5.autoEnd') : t('competitions.form.step5.keepRunning')}</span>
            </div>
          </div>

          {/* Section 3: Skill Question */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <h3 className="text-sm font-medium text-white uppercase tracking-wider">{t('competitions.form.step5.skillQuestion')}</h3>
              <button type="button" onClick={() => setCurrentStep(2)} className="text-xs text-primary hover:underline">{t('common.edit')}</button>
            </div>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="text-gray-500">{t('competitions.form.step5.question')}</span>
              <span className="text-white font-medium text-right line-clamp-1">{formData.questionText || '-'}</span>
              <span className="text-gray-500">{t('competitions.form.step1.images')}</span>
              <span className="text-white text-right">{formData.questionImagePreviews?.length || 0} {t('competitions.form.step5.imagesCount')}</span>
              <span className="text-gray-500">{t('competitions.form.step3.answerOptions')}</span>
              <span className="text-white text-right">{formData.answers.length} {t('competitions.form.step5.optionsCount')}</span>
            </div>
          </div>

          {/* Section 4 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <h3 className="text-sm font-medium text-white uppercase tracking-wider">{t('competitions.form.step5.drawSettings')}</h3>
              <button type="button" onClick={() => setCurrentStep(3)} className="text-xs text-primary hover:underline">{t('common.edit')}</button>
            </div>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="text-gray-500">{t('competitions.form.step5.endDate')}</span>
              <span className="text-white font-medium text-right">{formData.drawEndDate || '-'} {t('competitions.form.step5.atTime')} {formData.drawEndTime || '-'}</span>
              <span className="text-gray-500">{t('competitions.form.step5.autoEndLabel')}</span>
              <span className="text-white text-right">{formData.autoEndDraw ? t('common.yes') : t('common.no')}</span>
            </div>
          </div>
        </div>

      </CardContent>
    </Card>
  );

  const renderLivePreview = () => (
    <div className="sticky top-6">
      <h3 className="text-sm font-medium text-gray-400 mb-3 uppercase tracking-wider">
        {currentStep === 3 ? t('competitions.form.preview.countdownPreview') : t('competitions.form.preview.livePreview')}
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
              <Badge variant="hot">{t('competitions.detail.featured')}</Badge>
            </div>
          )}
        </div>
        
        <div className="p-5 space-y-4">
          <div>
            <h4 className="text-xl font-bold text-white line-clamp-2 leading-tight">
              {formData.title || t('competitions.form.preview.titlePlaceholder')}
            </h4>
            <p className="text-sm text-gray-400 mt-2 line-clamp-2">
              {formData.shortDescription || t('competitions.form.preview.descPlaceholder')}
            </p>
          </div>

          {currentStep === 3 ? (
            <div className="pt-4 border-t border-white/5 text-center">
              <p className="text-xs text-gray-500 mb-2">{t('competitions.form.preview.drawEndsIn')}</p>
              <div className="flex justify-center gap-2">
                <div className="bg-white/5 px-3 py-2 rounded-lg"><span className="text-xl font-mono text-white">05</span><span className="text-[10px] text-gray-500 block">{t('competitions.detail.days')}</span></div>
                <div className="bg-white/5 px-3 py-2 rounded-lg"><span className="text-xl font-mono text-white">12</span><span className="text-[10px] text-gray-500 block">{t('competitions.detail.hrs')}</span></div>
                <div className="bg-white/5 px-3 py-2 rounded-lg"><span className="text-xl font-mono text-white">45</span><span className="text-[10px] text-gray-500 block">{t('competitions.detail.min')}</span></div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between pt-4 border-t border-white/5">
              <div>
                <p className="text-xs text-gray-500">{t('competitions.form.preview.ticketPrice')}</p>
                <p className="text-lg font-bold text-primary mt-0.5">
                  {formData.ticketPrice ? `£${parseFloat(formData.ticketPrice).toLocaleString()}` : "£0.00"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">{t('competitions.form.preview.value')}</p>
                <p className="text-sm font-medium text-white mt-1">£{formData.prizeValue ? parseFloat(formData.prizeValue).toLocaleString() : "0.00"}</p>
              </div>
            </div>
          )}
          
          <Button variant="primary" className="w-full mt-2 pointer-events-none opacity-80" size="sm">
            {t('competitions.form.preview.enterNow')}
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 fade-in">
      {/* Stepper */}
      <div className="mb-8">
        <div className="flex items-start justify-between relative">
          <div className="absolute left-0 top-[14px] sm:top-[16px] w-full h-0.5 bg-white/10 -z-10"></div>
          {steps.map((step, index) => {
            const isActive = index === currentStep;
            const isCompleted = index < currentStep;
            return (
              <div key={step} className="flex flex-col items-center gap-1.5 sm:gap-2 bg-[#0a0a0a] px-0 sm:px-2 relative z-10 flex-1 text-center">
                <button 
                  type="button"
                  onClick={() => index < currentStep && setCurrentStep(index)}
                  disabled={index > currentStep}
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-medium border-2 transition-colors shrink-0 ${
                    isActive 
                      ? 'border-primary bg-primary text-black' 
                      : isCompleted
                        ? 'border-emerald-400 bg-emerald-400/10 text-emerald-400 cursor-pointer hover:bg-emerald-400/20'
                        : 'border-white/20 bg-[#0a0a0a] text-gray-400'
                }`}>
                  {isCompleted ? <CheckCircle2 size={16} className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : index + 1}
                </button>
                <span className={`text-[10px] sm:text-xs font-medium leading-tight sm:leading-normal ${isActive ? 'text-primary' : isCompleted ? 'text-emerald-400' : 'text-gray-500'}`}>
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
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between pt-4 border-t border-white/10 mt-6 gap-3">
            <Button variant="outline" className="w-full sm:w-auto order-2 sm:order-1" onClick={currentStep === 0 ? onCancel : handleBack}>
              {currentStep === 0 ? t('competitions.form.buttons.cancel') : t('common.back')}
            </Button>
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto order-1 sm:order-2">
              {!isEditMode && <Button variant="outline" className="w-full sm:w-auto" onClick={() => onSaveDraft && onSaveDraft(formData)}>{t('competitions.form.buttons.saveDraft')}</Button>}
              {currentStep === steps.length - 1 ? (
                <Button variant="primary" className="w-full sm:w-auto" onClick={() => onSubmit && onSubmit(formData)}>
                  {isEditMode ? t('competitions.form.buttons.saveChanges') : t('competitions.form.buttons.publishCompetition')}
                </Button>
              ) : (
                <Button variant="primary" className="w-full sm:w-auto" onClick={handleNext}>{t('competitions.form.buttons.nextStep')} {steps[currentStep + 1]}</Button>
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

export default CompetitionForm;
