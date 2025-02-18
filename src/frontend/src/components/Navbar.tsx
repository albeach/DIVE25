import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ClearanceLevel } from '../types';

const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <nav className="bg-nato-blue text-white shadow-lg">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-4">
            <Link to="/" className="font-bold text-xl">
              DIVE25
            </Link>
            {user && (
              <>
                <Link to="/documents" className="hover:text-gray-300">
                  Documents
                </Link>
                <span className="px-2 py-1 rounded bg-opacity-50 text-sm">
                  {user.clearanceLevel}
                </span>
              </>
            )}
          </div>
          
          {user && (
            <div className="flex items-center space-x-4">
              <span>{user.name}</span>
              <button 
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar; 